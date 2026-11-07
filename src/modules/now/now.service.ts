import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, MoreThan, Repository } from 'typeorm';
import { UploadService } from '../upload/upload.service';
import { UserFollow } from '../users/entities/user-follow.entity';
import { Promotion } from '../places/entities/promotion.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { NowPost, NowPostKind } from './entities/now-post.entity';
import { NowReaction, NowReactionType } from './entities/now-reaction.entity';
import { NowFriend } from './entities/now-friend.entity';
import { NowReport } from './entities/now-report.entity';
import { CreateNowPostDto } from './dto/create-now-post.dto';
import { NowAreaDto } from './dto/now-area.dto';
import { ReactNowDto } from './dto/react-now.dto';
import {
    NOW_RADIUS_M,
    NowVisibility,
    POSTS_PER_HOUR,
    PROMO_DEFAULT_HOURS,
    REPORTS_PER_DAY,
    REPORTS_TO_HIDE,
    canSee,
    computeExpiresAt,
    promoVisibleUntil,
    shouldHideByVotes,
} from './now-rules';

const MAX_POSTS = 200;
const MAX_PROMOS = 100;
const MB = 1024 * 1024;

// Mismas reglas de archivo que uploadPhoto/uploadVideo de places.controller (mov llega como video/quicktime).
const FILE_RULES = {
    photo: { mime: /^image\/(jpeg|png|webp)$/, maxBytes: 10 * MB, label: 'jpg, png o webp de hasta 10 MB' },
    video: { mime: /^video\/(mp4|quicktime)$/, maxBytes: 20 * MB, label: 'mp4 o mov de hasta 20 MB' },
};

// ST_Intersects con geography exige que la caja también lo sea.
const ENVELOPE = 'ST_MakeEnvelope(:minLng, :minLat, :maxLng, :maxLat, 4326)::geography';

export interface NowAuthorDto {
    id: string;
    fullName: string;
    avatarUrl: string | null;
}

export interface NowPostDto {
    id: string;
    kind: NowPostKind;
    text: string | null;
    mediaUrl: string | null;
    latitude: number;
    longitude: number;
    visibility: NowVisibility;
    likes: number;
    dislikes: number;
    checks: number;
    expiresAt: Date;
    createdAt: Date;
    author: NowAuthorDto;
    myReaction: NowReactionType | null;
}

export interface NowPromoDto {
    id: string;
    title: string;
    description: string | null;
    imageUrl: string | null;
    discountType: 'percentage' | 'fixed_amount' | null;
    discountValue: number | null;
    visibleUntil: Date;
    place: { id: string; name: string | null; latitude: number; longitude: number; coverImageUrl: string | null };
}

/** Solo id, nombre y foto: nunca email, teléfono ni hash. */
export const toPublicAuthor = (u: { id: string; fullName: string; avatarUrl?: string | null }): NowAuthorDto => ({
    id: u.id,
    fullName: u.fullName,
    avatarUrl: u.avatarUrl ?? null,
});

const isLatLng = (lat: unknown, lng: unknown) =>
    typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180; // NaN falla ambas

@Injectable()
export class NowService {
    constructor(
        @InjectRepository(NowPost) private readonly posts: Repository<NowPost>,
        @InjectRepository(NowReaction) private readonly reactions: Repository<NowReaction>,
        @InjectRepository(NowFriend) private readonly friends: Repository<NowFriend>,
        @InjectRepository(UserFollow) private readonly follows: Repository<UserFollow>,
        @InjectRepository(Promotion) private readonly promos: Repository<Promotion>,
        private readonly uploadService: UploadService,
    ) {}

    async isFollower(viewerId: string, authorId: string): Promise<boolean> {
        return (await this.follows.count({ where: { followerId: viewerId, followingId: authorId } })) > 0;
    }

    async inFriends(ownerId: string, friendId: string): Promise<boolean> {
        return (await this.friends.count({ where: { ownerId, friendId } })) > 0;
    }

    toDto(p: NowPost, myReaction: NowReactionType | null = null): NowPostDto {
        return {
            id: p.id,
            kind: p.kind,
            text: p.text,
            mediaUrl: p.mediaUrl,
            latitude: p.latitude,
            longitude: p.longitude,
            visibility: p.visibility,
            likes: p.likes,
            dislikes: p.dislikes,
            checks: p.checks,
            expiresAt: p.expiresAt,
            createdAt: p.createdAt,
            author: toPublicAuthor(p.author),
            myReaction,
        };
    }

    async create(authorId: string, dto: CreateNowPostDto, file?: Express.Multer.File): Promise<NowPostDto> {
        const { kind, latitude, longitude } = dto;
        if (!isLatLng(latitude, longitude)) {
            throw new BadRequestException('Necesitamos tu ubicación (latitud -90..90, longitud -180..180) para publicar');
        }
        const text = dto.text?.trim() || null;
        const rule = FILE_RULES[kind as 'photo' | 'video'];
        if (kind === 'text') {
            if (!text) throw new BadRequestException('Escribe algo para publicar');
        } else if (!rule) {
            throw new BadRequestException('Tipo de publicación inválido');
        } else if (!file) {
            throw new BadRequestException(`Falta ${kind === 'photo' ? 'la foto' : 'el video'}`);
        } else if (!rule.mime.test(file.mimetype) || file.size > rule.maxBytes) {
            throw new BadRequestException(`Archivo no permitido: ${rule.label}`);
        }

        // Pre-chequeo barato para no subir el archivo si ya llegó al límite. No es atómico: el definitivo va en la transacción.
        this.assertUnderHourlyLimit(await this.posts.count(this.lastHour(authorId)));

        let mediaUrl: string | null = null;
        if (kind !== 'text') {
            const up = kind === 'photo' ? await this.uploadService.uploadImage(file!, 'wuarike/now') : await this.uploadService.uploadVideo(file!);
            mediaUrl = up.secure_url;
        }

        const createdAt = new Date();
        // El candado asesor serializa las publicaciones del mismo usuario: recontar e insertar es atómico.
        // Si perdió la carrera, el archivo ya subido queda huérfano en Cloudinary (aceptado: es raro y barato).
        const saved = await this.posts.manager.transaction(async (m) => {
            await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [authorId]);
            this.assertUnderHourlyLimit(await m.count(NowPost, this.lastHour(authorId)));
            return m.save(
                m.create(NowPost, {
                    authorId,
                    kind,
                    text,
                    mediaUrl,
                    latitude,
                    longitude,
                    location: { type: 'Point', coordinates: [longitude, latitude] },
                    visibility: dto.visibility ?? 'all',
                    createdAt,
                    expiresAt: computeExpiresAt(createdAt, 0, 0, 0),
                }),
            );
        });
        return this.findOne(saved.id, authorId);
    }

    private lastHour(authorId: string) {
        return { where: { authorId, createdAt: MoreThan(new Date(Date.now() - 3600_000)) } };
    }

    private assertUnderHourlyLimit(recent: number): void {
        if (recent >= POSTS_PER_HOUR) {
            throw new HttpException(`Máximo ${POSTS_PER_HOUR} publicaciones por hora`, HttpStatus.TOO_MANY_REQUESTS);
        }
    }

    /** 404 si no existe, venció, está oculta o el lector no puede verla. */
    private async loadVisible(id: string, viewerId: string | null): Promise<NowPost> {
        const p = await this.posts.findOne({ where: { id }, relations: { author: true } });
        if (!p || p.hidden || p.expiresAt.getTime() <= Date.now()) throw new NotFoundException('Publicación no encontrada');

        const follows = p.visibility === 'followers' && viewerId ? await this.isFollower(viewerId, p.authorId) : false;
        const friends = p.visibility === 'friends' && viewerId ? await this.inFriends(p.authorId, viewerId) : false;
        if (!canSee(p.visibility, p.authorId, viewerId, follows, friends)) throw new NotFoundException('Publicación no encontrada');
        return p;
    }

    async findOne(id: string, viewerId: string | null): Promise<NowPostDto> {
        const p = await this.loadVisible(id, viewerId);
        const mine = viewerId ? await this.reactions.findOne({ where: { postId: id, userId: viewerId } }) : null;
        return this.toDto(p, mine?.type ?? null);
    }

    /** Metros entre la publicación y el punto dado (geography: distancia sobre el elipsoide). */
    async distanceMeters(postId: string, lat: number, lng: number): Promise<number> {
        const rows = await this.posts.query(
            'SELECT ST_Distance(location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) AS d FROM wuarike_db.now_posts WHERE id = $1',
            [postId, lng, lat],
        );
        const d = rows[0]?.d == null ? NaN : Number(rows[0].d); // Number(null) sería 0 m: cerca de todo
        if (!Number.isFinite(d)) throw new NotFoundException('Publicación no encontrada');
        return d;
    }

    async react(userId: string, postId: string, dto: ReactNowDto): Promise<NowPostDto> {
        const { type, latitude, longitude } = dto;
        if (type === 'check' && !isLatLng(latitude, longitude)) {
            throw new BadRequestException('Necesitamos tu ubicación (latitud -90..90, longitud -180..180) para dar ✅');
        }
        const post = await this.loadVisible(postId, userId);
        if (post.authorId === userId) throw new BadRequestException('No puedes reaccionar a tu propia publicación');
        // Después de la visibilidad: un 403 por distancia delataría dónde está una publicación que el usuario no puede ver.
        // `!(d <= radio)` y no `d > radio`: una distancia NaN no puede dar ✅.
        if (type === 'check' && !((await this.distanceMeters(postId, latitude!, longitude!)) <= NOW_RADIUS_M)) {
            throw new ForbiddenException(`Tienes que estar a ${NOW_RADIUS_M} m o menos para dar ✅`);
        }
        const patch = await this.recount(postId, (m) => m.upsert(NowReaction, { postId, userId, type }, ['postId', 'userId']));
        return this.toDto(Object.assign(post, patch), type);
    }

    async unreact(userId: string, postId: string): Promise<NowPostDto> {
        const post = await this.loadVisible(postId, userId);
        const patch = await this.recount(postId, (m) => m.delete(NowReaction, { postId, userId }));
        return this.toDto(Object.assign(post, patch), null);
    }

    /**
     * Escribe la reacción y recalcula likes/dislikes/checks, expiresAt y hidden contando now_reactions, con la fila
     * de la publicación bloqueada. Sin incrementos: si se borra un usuario en cascada sus reacciones desaparecen
     * sin tocar los contadores, y así se corrigen solos.
     */
    private recount(postId: string, write: (m: EntityManager) => Promise<unknown>) {
        return this.posts.manager.transaction(async (m) => {
            const post = await this.lockPost(m, postId);
            await write(m);
            const likes = await m.count(NowReaction, { where: { postId, type: 'like' } });
            const dislikes = await m.count(NowReaction, { where: { postId, type: 'dislike' } });
            const checks = await m.count(NowReaction, { where: { postId, type: 'check' } });

            // Nunca se toca una oculta por reportes; una oculta por votos se muestra otra vez si se recuperan.
            const byVotes = shouldHideByVotes(likes, dislikes, checks);
            let { hidden, hiddenReason } = post;
            if (byVotes && (hiddenReason == null || hiddenReason === 'votes')) [hidden, hiddenReason] = [true, 'votes'];
            else if (!byVotes && hiddenReason === 'votes') [hidden, hiddenReason] = [false, null];

            const patch = { likes, dislikes, checks, expiresAt: computeExpiresAt(post.createdAt, likes, dislikes, checks), hidden, hiddenReason };
            await m.update(NowPost, { id: postId }, patch);
            return patch;
        });
    }

    private async lockPost(m: EntityManager, postId: string): Promise<NowPost> {
        const post = await m.findOne(NowPost, {
            where: { id: postId },
            select: { id: true, createdAt: true, hidden: true, hiddenReason: true },
            lock: { mode: 'pessimistic_write' },
        });
        if (!post) throw new NotFoundException('Publicación no encontrada');
        return post;
    }

    async report(userId: string, postId: string, reason: string): Promise<{ ok: true }> {
        const post = await this.loadVisible(postId, userId);
        if (post.authorId === userId) throw new BadRequestException('No puedes reportar tu propia publicación');

        await this.posts.manager.transaction(async (m) => {
            // Candado por quien reporta (con prefijo, para no chocar con el de publicar): contar el día e insertar es atómico.
            await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`report:${userId}`]);
            if (await m.findOne(NowReport, { where: { postId, userId } })) return; // ya lo reportó: cuenta una sola vez
            const today = await m.count(NowReport, { where: { userId, createdAt: MoreThan(new Date(Date.now() - 86_400_000)) } });
            if (today >= REPORTS_PER_DAY) {
                throw new HttpException(`Máximo ${REPORTS_PER_DAY} reportes por día`, HttpStatus.TOO_MANY_REQUESTS);
            }

            await this.lockPost(m, postId);
            await m.insert(NowReport, { postId, userId, reason: reason.trim() || null });
            const reports = await m.count(NowReport, { where: { postId } });
            await m.update(NowPost, { id: postId }, reports >= REPORTS_TO_HIDE ? { reports, hidden: true, hiddenReason: 'reports' } : { reports });
        });
        return { ok: true };
    }

    async listArea(viewerId: string | null, box: NowAreaDto): Promise<{ posts: NowPostDto[]; promos: NowPromoDto[] }> {
        const { minLat, minLng, maxLat, maxLng } = box;
        if (!isLatLng(minLat, minLng) || !isLatLng(maxLat, maxLng) || minLat > maxLat || minLng > maxLng) {
            throw new BadRequestException('Zona inválida: minLat/minLng deben ser menores que maxLat/maxLng y estar en rango');
        }
        const params = { minLat, minLng, maxLat, maxLng };
        const [posts, promos] = await Promise.all([this.postsInArea(viewerId, params), this.promosInArea(params)]);
        return { posts, promos };
    }

    private async postsInArea(viewerId: string | null, params: Record<string, number>): Promise<NowPostDto[]> {
        const rows = await this.posts
            .createQueryBuilder('p')
            .innerJoin('p.author', 'a')
            .addSelect(['a.id', 'a.fullName', 'a.avatarUrl'])
            .where(`ST_Intersects(p.location, ${ENVELOPE})`, params)
            .andWhere('p.expiresAt > :now', { now: new Date() })
            .andWhere('p.hidden = false')
            .orderBy('p.createdAt', 'DESC')
            .limit(MAX_POSTS)
            .getMany();

        // ponytail: se filtra por visibilidad después del límite de 200; si una zona densa tiene muchas
        // publicaciones followers/friends ajenas, pueden quedar menos de 200. Pasar el filtro a SQL si ocurre.
        const authors = [...new Set(rows.filter((r) => r.visibility !== 'all' && r.authorId !== viewerId).map((r) => r.authorId))];
        const following = new Set<string>();
        const inFriends = new Set<string>();
        if (viewerId && authors.length) {
            (await this.follows.find({ where: { followerId: viewerId, followingId: In(authors) } })).forEach((f) => following.add(f.followingId));
            (await this.friends.find({ where: { friendId: viewerId, ownerId: In(authors) } })).forEach((f) => inFriends.add(f.ownerId));
        }
        const visible = rows.filter((r) => canSee(r.visibility, r.authorId, viewerId, following.has(r.authorId), inFriends.has(r.authorId)));

        const mine = new Map<string, NowReactionType>();
        if (viewerId && visible.length) {
            const found = await this.reactions.find({ where: { userId: viewerId, postId: In(visible.map((r) => r.id)) } });
            found.forEach((r) => mine.set(r.postId, r.type));
        }
        return visible.map((r) => this.toDto(r, mine.get(r.id) ?? null));
    }

    /** Promos de locales con suscripción activa. Regla de vigencia propia de "Ahora": no toca PromotionsService. */
    private async promosInArea(params: Record<string, number>): Promise<NowPromoDto[]> {
        const now = new Date();
        const rows = await this.promos
            .createQueryBuilder('pr')
            .innerJoin('pr.place', 'pl')
            .addSelect(['pl.id', 'pl.name', 'pl.latitude', 'pl.longitude', 'pl.coverImageUrl'])
            .where('pr.isActive = true')
            .andWhere("pl.status = 'active'")
            .andWhere((qb) => {
                const sub = qb.subQuery().select('1').from(Subscription, 's').where('s.placeId = pl.id').andWhere("s.status = 'active'").getQuery();
                return `EXISTS ${sub}`;
            })
            .andWhere(`ST_Intersects(pl.location, ${ENVELOPE})`, params)
            .andWhere('(pr.startsAt IS NULL OR pr.startsAt <= :now)', { now })
            // Mismo cálculo que promoVisibleUntil, para que el límite de 100 cuente solo promos vigentes.
            .andWhere('COALESCE(pr.endsAt, COALESCE(pr.startsAt, pr.createdAt) + make_interval(hours => :hours)) > :now', {
                hours: PROMO_DEFAULT_HOURS,
            })
            .orderBy('pr.createdAt', 'DESC')
            .limit(MAX_PROMOS)
            .getMany();

        return rows
            .map((p) => ({ p, visibleUntil: promoVisibleUntil(p) }))
            .filter(({ visibleUntil }) => visibleUntil.getTime() > now.getTime())
            .map(({ p, visibleUntil }) => ({
                id: p.id,
                title: p.title,
                description: p.description,
                imageUrl: p.imageUrl,
                discountType: p.discountType,
                discountValue: p.discountValue == null ? null : Number(p.discountValue),
                visibleUntil,
                place: {
                    id: p.place.id,
                    name: p.place.name,
                    latitude: Number(p.place.latitude),
                    longitude: Number(p.place.longitude),
                    coverImageUrl: p.place.coverImageUrl,
                },
            }));
    }
}
