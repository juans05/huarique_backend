import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { Checkin } from './entities/checkin.entity';
import { CheckinLike } from './entities/checkin-like.entity';
import { CheckinPhoto } from './entities/checkin-photo.entity';
import { PlaceInfoSuggestion } from './entities/place-info-suggestion.entity';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { SubmitInfoSuggestionDto } from './dto/submit-info-suggestion.dto';
import { UsersService } from '../users/users.service';
import { PlacesService } from '../places/places.service';
import { Place } from '../places/entities/place.entity';
import { Category } from '../places/entities/category.entity';
import { Amenity } from '../places/entities/amenity.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AntiFraudService } from './services/anti-fraud.service';
import { PaginatedResponse } from '../../common/dto/pagination.dto';
import { GamificationService } from '../gamification/gamification.service';

// Cantidad de votantes distintos que deben coincidir en el mismo valor
// sugerido antes de aplicar el cambio al local.
const INFO_SUGGESTION_CONSENSUS_THRESHOLD = 3;

const VALID_DAY_KEYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidDayHours(entry: unknown): entry is { day: string; open: string; close: string } {
    if (typeof entry !== 'object' || entry === null) return false;
    const { day, open, close } = entry as Record<string, unknown>;
    return (
        typeof day === 'string' &&
        VALID_DAY_KEYS.has(day) &&
        typeof open === 'string' &&
        TIME_RE.test(open) &&
        typeof close === 'string' &&
        TIME_RE.test(close)
    );
}

@Injectable()
export class CheckinsService {
    constructor(
        @InjectRepository(Checkin)
        private checkinsRepository: Repository<Checkin>,
        @InjectRepository(CheckinLike)
        private likesRepository: Repository<CheckinLike>,
        @InjectRepository(CheckinPhoto)
        private photosRepository: Repository<CheckinPhoto>,
        @InjectRepository(PlaceInfoSuggestion)
        private infoSuggestionsRepository: Repository<PlaceInfoSuggestion>,
        @InjectRepository(Place)
        private placesRepository: Repository<Place>,
        @InjectRepository(Category)
        private categoriesRepository: Repository<Category>,
        @InjectRepository(Amenity)
        private amenitiesRepository: Repository<Amenity>,
        private usersService: UsersService,
        private placesService: PlacesService,
        private auditLogService: AuditLogService,
        private antiFraudService: AntiFraudService,
        private gamificationService: GamificationService,
        @InjectDataSource()
        private dataSource: DataSource,
    ) { }

    async create(userId: string, dto: CreateCheckinDto): Promise<Checkin> {
        const place = await this.placesService.findOne(dto.placeId);

        const cooldown = await this.antiFraudService.validateCooldown(userId, dto.placeId);
        if (!cooldown.isValid) {
            throw new BadRequestException({
                message: `Ya hiciste check-in aquí hace poco. Intenta de nuevo en ${Math.ceil((cooldown.remainingTime ?? 0) / 60)} minutos.`,
                error: cooldown.error,
                remainingTime: cooldown.remainingTime,
            });
        }

        const dailyLimit = await this.antiFraudService.validateDailyLimit(userId);
        if (!dailyLimit.isValid) {
            throw new BadRequestException({
                message: 'Llegaste al límite de 10 check-ins por día. Vuelve mañana.',
                error: dailyLimit.error,
            });
        }

        if (dto.latitude != null && dto.longitude != null) {
            const speedCheck = await this.antiFraudService.validateSpeed(userId, dto.latitude, dto.longitude);
            if (speedCheck.suspicious) {
                await this.auditLogService.log({
                    action: 'checkin_suspicious_speed',
                    entityType: 'checkin',
                    placeId: dto.placeId,
                    userId,
                    metadata: { speedKmh: speedCheck.speed, latitude: dto.latitude, longitude: dto.longitude },
                    description: `Check-in marcado como sospechoso: ${speedCheck.speed} km/h desde el check-in anterior`,
                });
            }
        }

        const { photos, latitude, longitude, ...checkinData } = dto;

        // The check-in and its photos must land together: run them in a single
        // DB transaction so a failed photo insert can't leave an orphaned
        // check-in with missing photos.
        const savedCheckin = await this.dataSource.transaction(async (manager) => {
            const checkin = manager.create(Checkin, {
                ...checkinData,
                userId,
            });
            const saved = await manager.save(checkin);

            if (dto.photos && dto.photos.length > 0) {
                const photoEntities = dto.photos.map(url => manager.create(CheckinPhoto, {
                    checkinId: saved.id,
                    url,
                }));
                await manager.save(photoEntities);
            }

            return saved;
        });

        // Update Place Rating
        if (dto.rating && dto.rating > 0) {
            const currentTotal = place.totalReviews || 0;
            const currentRating = Number(place.rating) || 0;
            const newTotal = currentTotal + 1;
            const newRating = ((currentRating * currentTotal) + dto.rating) / newTotal;

            await this.placesService.updateRating(place.id, newRating, newTotal);
        }

        // Award points
        let points = 10;
        if (dto.photoUrl || (dto.photos && dto.photos.length > 0)) {
            points += 5;
        }
        await this.usersService.addPoints(userId, points);
        await this.gamificationService.updateStreak(userId);
        await this.gamificationService.checkAndAwardBadges(userId);

        return savedCheckin;
    }

    async getFeed(
        page = 1,
        size = 20,
        district?: string,
        userId?: string,
        placeId?: string,
        sort: 'recent' | 'top_rated' | 'low_rated' | 'most_liked' = 'recent',
        hasPhotos?: boolean,
    ): Promise<PaginatedResponse<any>> {
        const skip = (page - 1) * size;

        const queryBuilder = this.checkinsRepository.createQueryBuilder('checkin')
            .leftJoinAndSelect('checkin.user', 'user')
            .leftJoinAndSelect('checkin.place', 'place')
            .leftJoinAndSelect('checkin.photos', 'photos');

        switch (sort) {
            case 'top_rated':
                queryBuilder.orderBy('checkin.rating', 'DESC').addOrderBy('checkin.createdAt', 'DESC');
                break;
            case 'low_rated':
                queryBuilder.orderBy('checkin.rating', 'ASC').addOrderBy('checkin.createdAt', 'DESC');
                break;
            case 'most_liked':
                queryBuilder.orderBy('checkin.likesCount', 'DESC').addOrderBy('checkin.createdAt', 'DESC');
                break;
            default:
                queryBuilder.orderBy('checkin.createdAt', 'DESC');
        }

        if (district) {
            queryBuilder.andWhere('place.district = :district', { district });
        }

        if (placeId) {
            queryBuilder.andWhere('checkin.placeId = :placeId', { placeId });
        }

        if (hasPhotos) {
            queryBuilder.andWhere(
                `(checkin.photoUrl IS NOT NULL OR EXISTS (
                    SELECT 1 FROM wuarike_db.checkin_photos cp WHERE cp.checkin_id = checkin.id
                ))`,
            );
        }

        const [data, total] = await queryBuilder
            .skip(skip)
            .take(size)
            .getManyAndCount();

        // Map to include liked status if userId is provided
        let results = data;
        if (userId) {
            const checkinIds = data.map(c => c.id);
            if (checkinIds.length > 0) {
                const myLikes = await this.likesRepository.find({
                    where: { userId, checkinId: In(checkinIds) }
                } as any);
                const likedIds = new Set(myLikes.map(l => l.checkinId));
                results = data.map(c => ({ ...c, isLikedByMe: likedIds.has(c.id) }));
            }
        }

        return {
            data: results,
            meta: {
                total,
                page,
                size,
                totalPages: Math.ceil(total / size),
            },
        };
    }

    // Feed de gente que sigo — reusa getFeed pero acotado a sus check-ins.
    async getFriendsFeed(userId: string, page = 1, size = 20): Promise<PaginatedResponse<any>> {
        const followingIds = await this.usersService.getFollowingIds(userId);
        if (followingIds.length === 0) {
            return { data: [], meta: { total: 0, page, size, totalPages: 0 } };
        }

        const skip = (page - 1) * size;
        const [data, total] = await this.checkinsRepository.createQueryBuilder('checkin')
            .leftJoinAndSelect('checkin.user', 'user')
            .leftJoinAndSelect('checkin.place', 'place')
            .leftJoinAndSelect('checkin.photos', 'photos')
            .where('checkin.userId IN (:...followingIds)', { followingIds })
            .orderBy('checkin.createdAt', 'DESC')
            .skip(skip)
            .take(size)
            .getManyAndCount();

        const checkinIds = data.map((c) => c.id);
        let results: any[] = data;
        if (checkinIds.length > 0) {
            const myLikes = await this.likesRepository.find({ where: { userId, checkinId: In(checkinIds) } } as any);
            const likedIds = new Set(myLikes.map((l) => l.checkinId));
            results = data.map((c) => ({ ...c, isLikedByMe: likedIds.has(c.id) }));
        }

        return { data: results, meta: { total, page, size, totalPages: Math.ceil(total / size) } };
    }

    async like(userId: string, checkinId: string): Promise<number> {
        const checkin = await this.checkinsRepository.findOne({ where: { id: checkinId } });
        if (!checkin) throw new NotFoundException('Check-in no encontrado');

        const existingLike = await this.likesRepository.findOne({
            where: { userId, checkinId },
        });

        if (existingLike) return checkin.likesCount;

        await this.likesRepository.save({ userId, checkinId });
        await this.checkinsRepository.increment({ id: checkinId }, 'likesCount', 1);

        // Award points to the author of the checkin
        await this.usersService.addPoints(checkin.userId, 5);

        return checkin.likesCount + 1;
    }

    async unlike(userId: string, checkinId: string): Promise<number> {
        const checkin = await this.checkinsRepository.findOne({ where: { id: checkinId } });
        if (!checkin) throw new NotFoundException('Check-in no encontrado');

        const result = await this.likesRepository.delete({ userId, checkinId });
        if (result.affected && result.affected > 0) {
            await this.checkinsRepository.decrement({ id: checkinId }, 'likesCount', 1);
            // Optional: Remove points if unliked? Better not to keep it simple and avoid abuse.
            return checkin.likesCount - 1;
        }

        return checkin.likesCount;
    }

    // El check-in en sí no debe tener fricción — el plato se pregunta después,
    // sobre un check-in que ya existe, en vez de meterlo en el form principal.
    async addDish(userId: string, checkinId: string, dishName: string, dishPrice?: number): Promise<Checkin> {
        const checkin = await this.checkinsRepository.findOne({ where: { id: checkinId } });
        if (!checkin) throw new NotFoundException('Check-in no encontrado');
        if (checkin.userId !== userId) throw new ForbiddenException('No es tu check-in');

        checkin.dishName = dishName;
        if (dishPrice != null) checkin.dishPrice = dishPrice;
        return this.checkinsRepository.save(checkin);
    }

    async getTopDishes(placeId: string): Promise<{ dishName: string; orders: number }[]> {
        const rows = await this.checkinsRepository
            .createQueryBuilder('checkin')
            .select('checkin.dishName', 'dishName')
            .addSelect('COUNT(*)', 'orders')
            .where('checkin.placeId = :placeId', { placeId })
            .andWhere('checkin.dishName IS NOT NULL')
            .groupBy('checkin.dishName')
            .orderBy('orders', 'DESC')
            .limit(10)
            .getRawMany();
        return rows.map((r) => ({ dishName: r.dishName, orders: parseInt(r.orders, 10) }));
    }

    // Para el dueño del restaurante — resumen entendible, no un dashboard de gráficos.
    async getRestaurantStats(placeId: string): Promise<{
        checkinsThisWeek: number;
        checkinsThisMonth: number;
        bestDayOfWeek: string | null;
        topDish: { dishName: string; orders: number } | null;
        newCustomersThisMonth: number;
        returningCustomersThisMonth: number;
    }> {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [checkinsThisWeek, checkinsThisMonth, bestDayRows, topDishes, customerRows] = await Promise.all([
            this.checkinsRepository.createQueryBuilder('c')
                .where('c.placeId = :placeId', { placeId })
                .andWhere('c.createdAt >= :start', { start: startOfWeek })
                .getCount(),
            this.checkinsRepository.createQueryBuilder('c')
                .where('c.placeId = :placeId', { placeId })
                .andWhere('c.createdAt >= :start', { start: startOfMonth })
                .getCount(),
            this.checkinsRepository.createQueryBuilder('c')
                .select("TO_CHAR(c.createdAt, 'Day')", 'day')
                .addSelect('COUNT(*)', 'total')
                .where('c.placeId = :placeId', { placeId })
                .andWhere('c.createdAt >= :start', { start: startOfMonth })
                .groupBy('day')
                .orderBy('total', 'DESC')
                .limit(1)
                .getRawOne(),
            this.getTopDishes(placeId),
            this.dataSource.query(
                `WITH period_visitors AS (
                    SELECT DISTINCT user_id FROM wuarike_db.checkins WHERE place_id = $1 AND created_at >= $2
                ), first_visits AS (
                    SELECT user_id, MIN(created_at) as first_visit FROM wuarike_db.checkins WHERE place_id = $1 GROUP BY user_id
                )
                SELECT
                    COUNT(*) FILTER (WHERE fv.first_visit >= $2) as new_customers,
                    COUNT(*) FILTER (WHERE fv.first_visit < $2) as returning_customers
                FROM period_visitors pv
                JOIN first_visits fv ON fv.user_id = pv.user_id`,
                [placeId, startOfMonth],
            ),
        ]);

        return {
            checkinsThisWeek,
            checkinsThisMonth,
            bestDayOfWeek: bestDayRows?.day?.trim() || null,
            topDish: topDishes[0] || null,
            newCustomersThisMonth: parseInt(customerRows[0]?.new_customers || 0, 10),
            returningCustomersThisMonth: parseInt(customerRows[0]?.returning_customers || 0, 10),
        };
    }

    async submitInfoSuggestion(
        userId: string,
        dto: SubmitInfoSuggestionDto,
    ): Promise<{ votes: number; applied: boolean }> {
        await this.placesService.findOne(dto.placeId);

        const normalizedValue = dto.field === 'menu' ? 'outdated' : (dto.suggestedValue ?? '').trim();
        this.validateSuggestedValue(dto.field, normalizedValue);

        const existing = await this.infoSuggestionsRepository.findOne({
            where: { placeId: dto.placeId, field: dto.field, userId },
        });
        if (existing) {
            existing.suggestedValue = normalizedValue;
            existing.applied = false;
            await this.infoSuggestionsRepository.save(existing);
        } else {
            await this.infoSuggestionsRepository.save(
                this.infoSuggestionsRepository.create({
                    placeId: dto.placeId,
                    field: dto.field,
                    userId,
                    suggestedValue: normalizedValue,
                }),
            );
        }

        const matching = await this.infoSuggestionsRepository.find({
            where: {
                placeId: dto.placeId,
                field: dto.field,
                suggestedValue: normalizedValue,
                applied: false,
            },
        });

        if (matching.length < INFO_SUGGESTION_CONSENSUS_THRESHOLD) {
            return { votes: matching.length, applied: false };
        }

        await this.applyFieldChange(dto.placeId, dto.field, normalizedValue);

        await this.infoSuggestionsRepository.update(
            { id: In(matching.map((m) => m.id)) },
            { applied: true },
        );

        await this.auditLogService.log({
            action: 'place_info_suggestion_applied',
            entityType: 'place',
            entityId: dto.placeId,
            placeId: dto.placeId,
            userId,
            metadata: { field: dto.field, value: normalizedValue, voterIds: matching.map((m) => m.userId) },
            description: `Actualizado por consenso de ${matching.length} usuarios en check-in: ${dto.field} → ${normalizedValue}`,
        });

        return { votes: matching.length, applied: true };
    }

    private validateSuggestedValue(field: string, value: string): void {
        if (field === 'website' && value !== '') {
            // RestaurantSidebar en el frontend renderiza esto directo como
            // <a href={place.website}> — sin exigir http(s), un valor como
            // "javascript:alert(1)" quedaría clicable para cualquier visitante
            // en cuanto 3 usuarios coincidieran en sugerirlo.
            let url: URL;
            try {
                url = new URL(value);
            } catch {
                throw new BadRequestException('website debe ser una URL válida');
            }
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                throw new BadRequestException('website debe empezar con http:// o https://');
            }
        }
        if (field === 'name' && (value.length < 2 || value.length > 150)) {
            throw new BadRequestException('name debe tener entre 2 y 150 caracteres');
        }
    }

    private async applyFieldChange(placeId: string, field: string, value: string): Promise<void> {
        switch (field) {
            case 'phone':
                await this.placesRepository.update(placeId, { phone: value });
                break;
            case 'address':
                await this.placesRepository.update(placeId, { address: value });
                break;
            case 'name':
                await this.placesRepository.update(placeId, {
                    name: value,
                    nameNormalized: value.toLowerCase().trim(),
                });
                break;
            case 'website':
                await this.placesRepository.update(placeId, { website: value });
                break;
            case 'hours': {
                // El formulario de edición manda un horario estructurado por día
                // (JSON); las sugerencias más simples (botón lápiz) mandan texto
                // libre. Si no parsea como el shape exacto esperado, se guarda como
                // texto — day/open/close se validan estrictamente porque el filtro
                // openNow (places.service.ts) les hace un CAST ::time en SQL: un
                // valor que no sea HH:MM ahí rompería esa consulta para cualquier
                // búsqueda con openNow=true, no solo para este local.
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed) && parsed.every(isValidDayHours)) {
                        await this.placesRepository.update(placeId, { openingHours: parsed });
                        break;
                    }
                } catch {
                    // no era JSON, cae al texto libre
                }
                await this.placesRepository.update(placeId, { openHoursText: value });
                break;
            }
            case 'category': {
                const category = await this.categoriesRepository.findOne({ where: { slug: value } });
                if (category) await this.placesRepository.update(placeId, { categoryId: category.id });
                break;
            }
            case 'amenities': {
                const slugs = value.split(',').map((s) => s.trim()).filter(Boolean);
                const amenities = slugs.length
                    ? await this.amenitiesRepository.find({ where: { slug: In(slugs) } })
                    : [];
                const place = await this.placesRepository.findOne({ where: { id: placeId } });
                if (place) {
                    place.amenities = amenities;
                    await this.placesRepository.save(place);
                }
                break;
            }
            default:
                await this.placesRepository.update(placeId, { menuNeedsReview: true });
        }
    }
}
