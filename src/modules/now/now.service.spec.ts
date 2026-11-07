import 'reflect-metadata';
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NowService } from './now.service';
import { CreateNowPostDto } from './dto/create-now-post.dto';

const HOUR = 3600_000;
const author = { id: 'a1', fullName: 'Ana Pérez', avatarUrl: 'https://img/a.png', email: 'ana@x.pe', phone: '999', passwordHash: 'x' };

const post = (over: Record<string, any> = {}) => ({
    id: 'p1', authorId: 'a1', author, kind: 'text', text: 'hola', mediaUrl: null,
    latitude: -12.05, longitude: -77.04, visibility: 'all', likes: 0, dislikes: 0, checks: 0, hidden: false,
    expiresAt: new Date(Date.now() + HOUR), createdAt: new Date(), ...over,
});

/** QueryBuilder de mentira: encadena todo y devuelve `rows` en getMany. */
const fakeQb = (rows: any[]) => {
    const qb: any = { getMany: jest.fn().mockResolvedValue(rows) };
    for (const m of ['innerJoin', 'addSelect', 'where', 'andWhere', 'orderBy', 'limit', 'subQuery', 'select', 'from']) qb[m] = jest.fn().mockReturnValue(qb);
    qb.getQuery = jest.fn().mockReturnValue('(SELECT 1)');
    return qb;
};

const build = () => {
    // Lo que se escribe va por la transacción (manager); posts solo se usa para leer.
    const manager = {
        query: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((_t, x) => x),
        save: jest.fn(async (x) => ({ id: 'p1', ...x })),
    };
    const posts = {
        manager: { transaction: jest.fn((cb) => cb(manager)) },
        findOne: jest.fn().mockResolvedValue(post()),
        count: jest.fn().mockResolvedValue(0),
        createQueryBuilder: jest.fn(),
    };
    const reactions = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]) };
    const friends = { count: jest.fn().mockResolvedValue(0), find: jest.fn().mockResolvedValue([]) };
    const follows = { count: jest.fn().mockResolvedValue(0), find: jest.fn().mockResolvedValue([]) };
    const promos = { createQueryBuilder: jest.fn() };
    const upload = {
        uploadImage: jest.fn().mockResolvedValue({ secure_url: 'https://cdn/foto.jpg' }),
        uploadVideo: jest.fn().mockResolvedValue({ secure_url: 'https://cdn/video.mp4' }),
    };
    const svc = new NowService(posts as any, reactions as any, friends as any, follows as any, promos as any, upload as any);
    return { svc, posts, manager, reactions, friends, follows, promos, upload };
};

const file = (mimetype: string, size = 1000) => ({ mimetype, size, buffer: Buffer.from('x'), originalname: 'f' }) as Express.Multer.File;
const text = { kind: 'text', text: 'Hay cola en la esquina', latitude: -12.05, longitude: -77.04 } as any;

describe('NowService.create', () => {
    it('rechaza sin latitude/longitude (BadRequestException)', async () => {
        const { svc } = build();
        await expect(svc.create('a1', { ...text, latitude: undefined }, undefined)).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.create('a1', { ...text, longitude: undefined }, undefined)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza lat/lng fuera de rango', async () => {
        const { svc } = build();
        await expect(svc.create('a1', { ...text, latitude: 91 }, undefined)).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.create('a1', { ...text, longitude: -181 }, undefined)).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.create('a1', { ...text, latitude: NaN }, undefined)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza kind=text sin texto, y kind=photo|video sin archivo', async () => {
        const { svc } = build();
        await expect(svc.create('a1', { ...text, text: '   ' }, undefined)).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.create('a1', { ...text, kind: 'photo' }, undefined)).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.create('a1', { ...text, kind: 'video' }, undefined)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un archivo de tipo o tamaño no permitido', async () => {
        const { svc, upload } = build();
        await expect(svc.create('a1', { ...text, kind: 'photo' }, file('image/gif'))).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.create('a1', { ...text, kind: 'photo' }, file('image/png', 11 * 1024 * 1024))).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.create('a1', { ...text, kind: 'video' }, file('video/avi'))).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.create('a1', { ...text, kind: 'video' }, file('video/mp4', 21 * 1024 * 1024))).rejects.toBeInstanceOf(BadRequestException);
        expect(upload.uploadImage).not.toHaveBeenCalled();
        expect(upload.uploadVideo).not.toHaveBeenCalled();
    });

    it('fija expiresAt = createdAt + 24 h y guarda el punto como GeoJSON (lng, lat)', async () => {
        const { svc, manager } = build();
        await svc.create('a1', text, undefined);
        const saved = manager.save.mock.calls[0][0];
        expect(saved.expiresAt.getTime() - saved.createdAt.getTime()).toBe(24 * HOUR);
        expect(saved.location).toEqual({ type: 'Point', coordinates: [-77.04, -12.05] });
        expect(saved.authorId).toBe('a1');
        expect(saved.visibility).toBe('all');
    });

    it('un texto no guarda mediaUrl aunque llegue un archivo', async () => {
        const { svc, manager, upload } = build();
        await svc.create('a1', text, file('image/png'));
        expect(manager.save.mock.calls[0][0].mediaUrl).toBeNull();
        expect(upload.uploadImage).not.toHaveBeenCalled();
    });

    it('sube foto y video a Cloudinary y guarda la URL', async () => {
        const { svc, manager, upload } = build();
        await svc.create('a1', { ...text, kind: 'photo', text: undefined }, file('image/jpeg'));
        expect(manager.save.mock.calls[0][0]).toMatchObject({ kind: 'photo', mediaUrl: 'https://cdn/foto.jpg', text: null });
        await svc.create('a1', { ...text, kind: 'video' }, file('video/quicktime'));
        expect(manager.save.mock.calls[1][0]).toMatchObject({ kind: 'video', mediaUrl: 'https://cdn/video.mp4' });
        expect(upload.uploadImage).toHaveBeenCalledTimes(1);
        expect(upload.uploadVideo).toHaveBeenCalledTimes(1);
    });

    it('limita a 5 publicaciones por hora por usuario (429) antes de subir el archivo', async () => {
        const { svc, posts, manager, upload } = build();
        posts.count.mockResolvedValue(5);
        const err = await svc.create('a1', { ...text, kind: 'photo' }, file('image/png')).catch((e) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(429);
        expect(upload.uploadImage).not.toHaveBeenCalled();
        expect(manager.save).not.toHaveBeenCalled();
    });

    it('carrera: el recuento dentro de la transacción rechaza con 429 y no inserta', async () => {
        const { svc, posts, manager } = build();
        posts.count.mockResolvedValue(4); // el pre-chequeo pasa; otra petición del mismo usuario ya publicó
        manager.count.mockResolvedValue(5);
        const err = await svc.create('a1', text, undefined).catch((e) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(429);
        expect(manager.save).not.toHaveBeenCalled();
    });

    it('toma el candado asesor del autor antes de recontar e insertar', async () => {
        const { svc, manager } = build();
        await svc.create('a1', text, undefined);
        expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock(hashtext($1))'), ['a1']);
        const lock = manager.query.mock.invocationCallOrder[0];
        expect(lock).toBeLessThan(manager.count.mock.invocationCallOrder[0]);
        expect(manager.count.mock.invocationCallOrder[0]).toBeLessThan(manager.save.mock.invocationCallOrder[0]);
    });
});

describe('NowService.findOne', () => {
    it('devuelve la publicación visible con su autor público', async () => {
        const { svc } = build();
        const dto = await svc.findOne('p1', null);
        expect(dto).toMatchObject({ id: 'p1', text: 'hola', myReaction: null });
    });

    it('lanza NotFoundException si expiresAt < ahora', async () => {
        const { svc, posts } = build();
        posts.findOne.mockResolvedValue(post({ expiresAt: new Date(Date.now() - 1000) }));
        await expect(svc.findOne('p1', null)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza NotFoundException si hidden = true', async () => {
        const { svc, posts } = build();
        posts.findOne.mockResolvedValue(post({ hidden: true }));
        await expect(svc.findOne('p1', 'u2')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza NotFoundException si no existe', async () => {
        const { svc, posts } = build();
        posts.findOne.mockResolvedValue(null);
        await expect(svc.findOne('nope', null)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lanza NotFoundException si visibility='friends' y el lector no está en now_friends del autor", async () => {
        const { svc, posts, follows, friends } = build();
        posts.findOne.mockResolvedValue(post({ visibility: 'friends' }));
        follows.count.mockResolvedValue(1); // lo sigue, pero no es amigo
        friends.count.mockResolvedValue(0);
        await expect(svc.findOne('p1', 'u2')).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.findOne('p1', null)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("deja ver 'friends' al amigo y al autor, y 'followers' al seguidor", async () => {
        const { svc, posts, follows, friends } = build();
        posts.findOne.mockResolvedValue(post({ visibility: 'friends' }));
        friends.count.mockResolvedValue(1);
        await expect(svc.findOne('p1', 'u2')).resolves.toMatchObject({ id: 'p1' });
        await expect(svc.findOne('p1', 'a1')).resolves.toMatchObject({ id: 'p1' });
        posts.findOne.mockResolvedValue(post({ visibility: 'followers' }));
        follows.count.mockResolvedValue(1);
        await expect(svc.findOne('p1', 'u2')).resolves.toMatchObject({ id: 'p1' });
    });

    it('incluye la reacción del lector', async () => {
        const { svc, reactions } = build();
        reactions.findOne.mockResolvedValue({ type: 'check' });
        await expect(svc.findOne('p1', 'u2')).resolves.toMatchObject({ myReaction: 'check' });
    });
});

describe('NowService.toDto', () => {
    it('no expone email, phone ni passwordHash del autor', () => {
        const { svc } = build();
        const dto = svc.toDto(post() as any);
        expect(dto.author).toEqual({ id: 'a1', fullName: 'Ana Pérez', avatarUrl: 'https://img/a.png' });
        expect(JSON.stringify(dto)).not.toMatch(/ana@x\.pe|999|passwordHash/);
    });
});

describe('NowService.listArea', () => {
    const box = { minLat: -12.1, minLng: -77.1, maxLat: -12.0, maxLng: -77.0 };

    it('rechaza una caja inválida (400)', async () => {
        const { svc } = build();
        await expect(svc.listArea(null, { ...box, minLat: -12.0, maxLat: -12.1 })).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.listArea(null, { ...box, maxLng: 200 })).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.listArea(null, { ...box, minLat: NaN })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('aplica la visibilidad: un seguidor que no es amigo no ve las publicaciones friends', async () => {
        const { svc, posts, promos, follows, friends } = build();
        posts.createQueryBuilder.mockReturnValue(
            fakeQb([post({ id: 'todos' }), post({ id: 'amigos', visibility: 'friends' }), post({ id: 'seguidores', visibility: 'followers' })]),
        );
        promos.createQueryBuilder.mockReturnValue(fakeQb([]));
        follows.find.mockResolvedValue([{ followingId: 'a1' }]);
        friends.find.mockResolvedValue([]);
        const { posts: out } = await svc.listArea('u2', box);
        expect(out.map((p) => p.id)).toEqual(['todos', 'seguidores']);
    });

    it('sin sesión solo ve las publicaciones para todos', async () => {
        const { svc, posts, promos } = build();
        posts.createQueryBuilder.mockReturnValue(fakeQb([post({ id: 'todos' }), post({ id: 'seg', visibility: 'followers' })]));
        promos.createQueryBuilder.mockReturnValue(fakeQb([]));
        const { posts: out } = await svc.listArea(null, box);
        expect(out.map((p) => p.id)).toEqual(['todos']);
    });

    it('promos: descarta las vencidas según promoVisibleUntil y arma el DTO', async () => {
        const { svc, posts, promos } = build();
        posts.createQueryBuilder.mockReturnValue(fakeQb([]));
        const place = { id: 'pl1', name: 'La Esquina', latitude: '-12.05', longitude: '-77.04', coverImageUrl: 'c.jpg' };
        const base = { title: 'Promo', description: null, imageUrl: null, discountType: 'percentage', discountValue: '15.00', startsAt: null, place };
        promos.createQueryBuilder.mockReturnValue(
            fakeQb([
                { ...base, id: 'viva', endsAt: new Date(Date.now() + HOUR), createdAt: new Date() },
                { ...base, id: 'vencida', endsAt: new Date(Date.now() - HOUR), createdAt: new Date() },
                { ...base, id: 'sin-fin-vieja', endsAt: null, createdAt: new Date(Date.now() - 30 * HOUR) },
            ]),
        );
        const { promos: out } = await svc.listArea(null, box);
        expect(out.map((p) => p.id)).toEqual(['viva']);
        expect(out[0]).toMatchObject({
            discountValue: 15,
            place: { id: 'pl1', name: 'La Esquina', latitude: -12.05, longitude: -77.04, coverImageUrl: 'c.jpg' },
        });
    });
});

describe('NowService.isFollower / inFriends', () => {
    it('consultan user_follows y now_friends', async () => {
        const { svc, follows, friends } = build();
        follows.count.mockResolvedValue(1);
        friends.count.mockResolvedValue(0);
        await expect(svc.isFollower('u2', 'a1')).resolves.toBe(true);
        await expect(svc.inFriends('a1', 'u2')).resolves.toBe(false);
        expect(follows.count).toHaveBeenCalledWith({ where: { followerId: 'u2', followingId: 'a1' } });
        expect(friends.count).toHaveBeenCalledWith({ where: { ownerId: 'a1', friendId: 'u2' } });
    });
});

describe('CreateNowPostDto', () => {
    // Igual que el ValidationPipe global: conversión implícita.
    const errorsFor = (extra: Record<string, unknown>) =>
        validate(plainToInstance(CreateNowPostDto, { kind: 'text', text: 'hola', latitude: '-12.05', longitude: '-77.04', ...extra }, { enableImplicitConversion: true }));

    it('acepta multipart (números como texto)', async () => {
        expect(await errorsFor({})).toHaveLength(0);
    });

    it("rechaza latitude/longitude vacías o ausentes (no se convierten en 0)", async () => {
        expect((await errorsFor({ latitude: '' })).map((e) => e.property)).toContain('latitude');
        expect((await errorsFor({ longitude: undefined })).map((e) => e.property)).toContain('longitude');
        expect((await errorsFor({ latitude: 'abc' })).map((e) => e.property)).toContain('latitude');
    });

    it('rechaza kind o visibility desconocidos y texto de más de 500', async () => {
        expect((await errorsFor({ kind: 'gif' })).map((e) => e.property)).toContain('kind');
        expect((await errorsFor({ visibility: 'nadie' })).map((e) => e.property)).toContain('visibility');
        expect((await errorsFor({ text: 'x'.repeat(501) })).map((e) => e.property)).toContain('text');
    });
});
