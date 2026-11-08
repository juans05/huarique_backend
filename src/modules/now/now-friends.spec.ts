import 'reflect-metadata';
import { BadRequestException, CanActivate, ExecutionContext, INestApplication, NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAccessService } from '../platform-access/platform-access.service';
import { NowService } from './now.service';
import { NowController } from './now.controller';
import { NowAdminController } from './now-admin.controller';
import { NowPost } from './entities/now-post.entity';
import { NowReport } from './entities/now-report.entity';

const HOUR = 3600_000;
const ME = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const POST = '33333333-3333-3333-3333-333333333333';
const author = { id: 'a1', fullName: 'Ana Pérez', avatarUrl: null, email: 'ana@x.pe', phone: '999', passwordHash: 'x' };

const mkPost = (over: Record<string, any> = {}) => ({
    id: 'p1', authorId: 'a1', author, kind: 'text', text: 'hola', mediaUrl: null,
    latitude: -12.05, longitude: -77.04, visibility: 'all', likes: 0, dislikes: 0, checks: 0, reports: 0,
    hidden: false, hiddenReason: null, createdAt: new Date(Date.now() - HOUR), expiresAt: new Date(Date.now() + HOUR), ...over,
});

/** QueryBuilder de mentira: anota cada llamada y devuelve `rows` y `total` al final. */
const mkQb = (rows: any[], total = rows.length) => {
    const qb: any = { getManyAndCount: jest.fn().mockResolvedValue([rows, total]), getMany: jest.fn().mockResolvedValue(rows) };
    for (const m of ['innerJoin', 'addSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'offset', 'limit']) qb[m] = jest.fn().mockReturnValue(qb);
    return qb;
};
/** Todas las condiciones del WHERE, en el orden en que se pusieron, con sus parámetros. */
const wheres = (qb: any): [string, any][] => [...qb.where.mock.calls, ...qb.andWhere.mock.calls];
const sqlOf = (qb: any) => wheres(qb).map(([c]) => c).join(' AND ');

/** Base de datos de mentira: las filas de reportes viven en `state`, el manager de la transacción las lee y las borra. */
const build = (rows: any[] = [], total?: number, postOver: Record<string, any> = {}, reports: any[] = []) => {
    const qb = mkQb(rows, total);
    const state = { post: mkPost({ id: POST, hidden: true, hiddenReason: 'reports', reports: 3, ...postOver }), reports: [...reports] };
    const manager = {
        findOne: jest.fn(async () => state.post),
        update: jest.fn(async (_E: any, _w: any, patch: any) => {
            Object.assign(state.post, patch);
        }),
        delete: jest.fn(async (E: any, w: any) => {
            if (E === NowReport) state.reports = state.reports.filter((r) => r.postId !== w.postId);
        }),
    };
    const posts = {
        createQueryBuilder: jest.fn(() => qb),
        manager: { transaction: jest.fn((cb) => cb(manager)) },
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const reactions = { find: jest.fn().mockResolvedValue([]) };
    const friends = { count: jest.fn().mockResolvedValue(0), find: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue({ affected: 0 }) };
    const follows = { count: jest.fn().mockResolvedValue(0) };
    const svc = new NowService(posts as any, reactions as any, friends as any, follows as any, {} as any, {} as any);
    return { svc, qb, state, manager, posts, reactions, friends, follows };
};

describe('NowService: lista de amigos', () => {
    it('agregar amigo que no me sigue → BadRequestException', async () => {
        const { svc, friends, follows } = build();
        follows.count.mockResolvedValue(0);
        await expect(svc.addFriend(ME, OTHER)).rejects.toBeInstanceOf(BadRequestException);
        expect(follows.count).toHaveBeenCalledWith({ where: { followerId: OTHER, followingId: ME } }); // OTHER me sigue a mí, no al revés
        expect(friends.upsert).not.toHaveBeenCalled();
    });

    it('no puedes agregarte a ti mismo (400), sin consultar nada', async () => {
        const { svc, friends, follows } = build();
        await expect(svc.addFriend(ME, ME)).rejects.toBeInstanceOf(BadRequestException);
        expect(follows.count).not.toHaveBeenCalled();
        expect(friends.upsert).not.toHaveBeenCalled();
    });

    it('agregar a quien me sigue guarda dueño y amigo; repetirlo no falla', async () => {
        const { svc, friends, follows } = build();
        follows.count.mockResolvedValue(1);
        await expect(svc.addFriend(ME, OTHER)).resolves.toEqual({ ok: true });
        await expect(svc.addFriend(ME, OTHER)).resolves.toEqual({ ok: true });
        expect(friends.upsert).toHaveBeenCalledTimes(2);
        expect(friends.upsert).toHaveBeenCalledWith({ ownerId: ME, friendId: OTHER }, ['ownerId', 'friendId']);
    });

    it('quitar un amigo borra por dueño y amigo, exista o no', async () => {
        const { svc, friends } = build();
        await expect(svc.removeFriend(ME, OTHER)).resolves.toEqual({ ok: true });
        expect(friends.delete).toHaveBeenCalledWith({ ownerId: ME, friendId: OTHER });
    });

    it('la lista responde solo id, nombre y foto de cada amigo', async () => {
        const { svc, friends } = build();
        friends.find.mockResolvedValue([{ id: 'f1', friend: author }]);
        const list = await svc.listFriends(ME);
        expect(list).toEqual([{ id: 'a1', fullName: 'Ana Pérez', avatarUrl: null }]);
        expect(JSON.stringify(list)).not.toMatch(/ana@x\.pe|999|passwordHash/);
        expect(friends.find).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: ME } }));
    });
});

describe('NowService.feed', () => {
    it('feed friends no incluye una publicación friends de un autor que no me tiene en su lista', async () => {
        const { svc, qb } = build();
        await svc.feed(ME, { scope: 'friends' });
        const [visibility, params] = wheres(qb).find(([c]) => c.includes("p.visibility = 'friends'"))!;

        // La rama 'friends': el dueño de la lista es el AUTOR de la publicación y el lector es el amigo (nunca al revés).
        expect(visibility).toMatch(/FROM wuarike_db\.now_friends vn WHERE vn\.owner_id = p\.authorId AND vn\.friend_id = :viewerId\)/);
        expect(visibility).not.toMatch(/vn\.owner_id = :viewerId/);
        expect(params).toEqual({ viewerId: ME });
        // Y que el autor esté en mi lista (scope) no basta: cada publicación pasa también por la visibilidad.
        expect(wheres(qb).filter(([c]) => c === visibility)).toHaveLength(1);
        expect(sqlOf(qb)).toMatch(/fa\.owner_id = p\.authorId AND fa\.friend_id = :viewerId[\s\S]*fb\.owner_id = :viewerId AND fb\.friend_id = p\.authorId/);
    });

    it('la visibilidad va en el WHERE de la misma consulta que pagina, en todos los scopes', async () => {
        for (const scope of ['following', 'friends', 'nearby'] as const) {
            const { svc, qb, posts } = build();
            await svc.feed(ME, { scope, lat: -12.05, lng: -77.04 });
            expect(posts.createQueryBuilder).toHaveBeenCalledTimes(1);
            expect(sqlOf(qb)).toContain("p.authorId = :viewerId OR p.visibility = 'all'");
            expect(sqlOf(qb)).toMatch(/p\.visibility = 'followers' AND EXISTS \(SELECT 1 FROM wuarike_db\.user_follows vf WHERE vf\.follower_id = :viewerId AND vf\.following_id = p\.authorId\)/);
            expect(qb.limit).toHaveBeenCalledWith(20);
            expect(qb.getManyAndCount).toHaveBeenCalledTimes(1); // y no hay un getMany aparte que filtre después
        }
    });

    it('solo vigentes y no ocultas', async () => {
        const { svc, qb } = build();
        await svc.feed(ME, { scope: 'following' });
        expect(wheres(qb).map(([c]) => c)).toEqual(expect.arrayContaining(['p.hidden = false', 'p.expiresAt > :now']));
        const now = wheres(qb).find(([c]) => c === 'p.expiresAt > :now')![1].now as Date;
        expect(Math.abs(now.getTime() - Date.now())).toBeLessThan(5000);
    });

    it('pagina de 20 en 20, las más nuevas primero, y responde { data, total } con el total del mismo filtro', async () => {
        const { svc, qb } = build([mkPost()], 45);
        const page = await svc.feed(ME, { scope: 'following', page: 3 });
        expect(qb.orderBy).toHaveBeenCalledWith('p.createdAt', 'DESC');
        expect(qb.offset).toHaveBeenCalledWith(40);
        expect(qb.limit).toHaveBeenCalledWith(20);
        expect(page.total).toBe(45);
        expect(page.data).toHaveLength(1);
        expect(page.data[0]).toMatchObject({ id: 'p1', author: { id: 'a1', fullName: 'Ana Pérez', avatarUrl: null }, myReaction: null });
        expect(JSON.stringify(page)).not.toMatch(/ana@x\.pe|999|passwordHash/);

        const first = build();
        await first.svc.feed(ME, { scope: 'following' });
        expect(first.qb.offset).toHaveBeenCalledWith(0);
    });

    it('trae mi reacción en cada publicación', async () => {
        const { svc, reactions } = build([mkPost({ id: 'p1' }), mkPost({ id: 'p2' })]);
        reactions.find.mockResolvedValue([{ postId: 'p2', userId: ME, type: 'check' }]);
        const { data } = await svc.feed(ME, { scope: 'following' });
        expect(data.map((d) => d.myReaction)).toEqual([null, 'check']);
    });

    it('following: solo autores que sigo', async () => {
        const { svc, qb } = build();
        await svc.feed(ME, { scope: 'following' });
        expect(sqlOf(qb)).toMatch(/user_follows sf WHERE sf\.follower_id = :viewerId AND sf\.following_id = p\.authorId/);
    });

    it('friends: autores que me tienen en su lista o que yo tengo en la mía', async () => {
        const { svc, qb } = build();
        await svc.feed(ME, { scope: 'friends' });
        expect(sqlOf(qb)).toMatch(/now_friends fa WHERE fa\.owner_id = p\.authorId AND fa\.friend_id = :viewerId\) OR EXISTS \(SELECT 1 FROM wuarike_db\.now_friends fb WHERE fb\.owner_id = :viewerId AND fb\.friend_id = p\.authorId/);
    });

    it('nearby: hasta 5 km del punto, sobre geography y en el orden (lng, lat)', async () => {
        const { svc, qb } = build();
        await svc.feed(ME, { scope: 'nearby', lat: -12.05, lng: -77.04 });
        const [clause, params] = wheres(qb).find(([c]) => c.includes('ST_DWithin'))!;
        expect(clause).toBe('ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)');
        expect(params).toEqual({ lat: -12.05, lng: -77.04, radius: 5000 });
    });

    it('nearby sin lat/lng, o con uno solo, o fuera de rango → BadRequestException, sin consultar', async () => {
        const { svc, posts } = build();
        for (const q of [{}, { lat: -12.05 }, { lng: -77.04 }, { lat: 95, lng: -77 }, { lat: -12, lng: 181 }, { lat: NaN, lng: 1 }]) {
            await expect(svc.feed(ME, { scope: 'nearby', ...q })).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(posts.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('following y friends no piden ubicación', async () => {
        const { svc } = build();
        await expect(svc.feed(ME, { scope: 'following' })).resolves.toEqual({ data: [], total: 0 });
        await expect(svc.feed(ME, { scope: 'friends' })).resolves.toEqual({ data: [], total: 0 });
    });
});

describe('NowService.mine', () => {
    it('incluye una publicación vencida y una oculta: el autor ve todas las suyas', async () => {
        const expired = mkPost({ id: 'viejo', expiresAt: new Date(Date.now() - HOUR) });
        const hidden = mkPost({ id: 'oculto', hidden: true, hiddenReason: 'reports' });
        const { svc, qb } = build([mkPost({ id: 'vigente' }), expired, hidden]);
        const page = await svc.mine(ME, 2);

        expect(page.data.map((d) => d.id)).toEqual(['vigente', 'viejo', 'oculto']);
        expect(page.data[1].expiresAt.getTime()).toBeLessThan(Date.now());
        expect(page.data.map((d) => d.hidden)).toEqual([false, false, true]); // la app la marca "Oculta"
        expect(wheres(qb)).toEqual([['p.authorId = :userId', { userId: ME }]]); // sin filtro de vigencia ni de oculta
        expect(qb.orderBy).toHaveBeenCalledWith('p.createdAt', 'DESC');
        expect(qb.offset).toHaveBeenCalledWith(20);
        expect(qb.limit).toHaveBeenCalledWith(20);
    });
});

describe('NowService: moderación', () => {
    it('restaurar pone hidden=false y elimina sus now_reports', async () => {
        const reports = [
            { postId: POST, userId: 'u1' },
            { postId: POST, userId: 'u2' },
            { postId: POST, userId: 'u3' },
            { postId: 'otra', userId: 'u1' },
        ];
        const { svc, state, manager } = build([], 0, {}, reports);
        await expect(svc.restore(POST)).resolves.toEqual({ ok: true });

        expect(state.post).toMatchObject({ hidden: false, hiddenReason: null, reports: 0 });
        expect(state.reports).toEqual([{ postId: 'otra', userId: 'u1' }]); // solo se borran los de esta publicación
        expect(manager.delete).toHaveBeenCalledWith(NowReport, { postId: POST });
    });

    it('restaurar escribe hidden y hiddenReason juntos, con la fila bloqueada, dentro de una sola transacción', async () => {
        const { svc, manager, posts } = build();
        await svc.restore(POST);
        expect(posts.manager.transaction).toHaveBeenCalledTimes(1);
        expect(manager.findOne).toHaveBeenCalledWith(NowPost, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
        expect(manager.update).toHaveBeenCalledWith(NowPost, { id: POST }, { hidden: false, hiddenReason: null, reports: 0 });
        expect(manager.findOne.mock.invocationCallOrder[0]).toBeLessThan(manager.update.mock.invocationCallOrder[0]);
    });

    it('restaurar una publicación que no existe → 404 y no borra nada', async () => {
        const { svc, manager } = build();
        manager.findOne.mockResolvedValue(null as any);
        await expect(svc.restore(POST)).rejects.toBeInstanceOf(NotFoundException);
        expect(manager.update).not.toHaveBeenCalled();
        expect(manager.delete).not.toHaveBeenCalled();
    });

    it('reportadas: las ocultas con su número de reportes y motivo, el autor solo con datos públicos', async () => {
        const row = mkPost({ id: 'p9', hidden: true, hiddenReason: 'votes', reports: 2 });
        const { svc, qb } = build([row]);
        const list = await svc.reported();
        expect(wheres(qb)).toEqual([['p.hidden = true']]);
        expect(qb.orderBy).toHaveBeenCalledWith('p.createdAt', 'DESC');
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ id: 'p9', reports: 2, hiddenReason: 'votes', author: { id: 'a1', fullName: 'Ana Pérez', avatarUrl: null } });
        expect(JSON.stringify(list)).not.toMatch(/ana@x\.pe|999|passwordHash/);
    });

    it('borrar elimina la publicación; 404 si ya no existía', async () => {
        const { svc, posts } = build();
        await expect(svc.remove(POST)).resolves.toEqual({ ok: true });
        expect(posts.delete).toHaveBeenCalledWith({ id: POST });
        posts.delete.mockResolvedValue({ affected: 0 });
        await expect(svc.remove(POST)).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('HTTP: rutas, validación y guardas', () => {
    let app: INestApplication;
    const svc = {
        feed: jest.fn(), mine: jest.fn(), listFriends: jest.fn(), addFriend: jest.fn(), removeFriend: jest.fn(),
        reported: jest.fn(), restore: jest.fn(), remove: jest.fn(),
    };
    // Sesión de mentira: el JWT real es de passport; aquí el header x-user trae { id, role }.
    const fakeJwt: CanActivate = {
        canActivate(ctx: ExecutionContext) {
            const req = ctx.switchToHttp().getRequest();
            if (!req.headers['x-user']) throw new UnauthorizedException();
            req.user = JSON.parse(req.headers['x-user']);
            return true;
        },
    };
    const user = JSON.stringify({ id: ME, role: 'user' });
    const admin = JSON.stringify({ id: ME, role: 'admin' });

    beforeAll(async () => {
        const mod = await Test.createTestingModule({
            controllers: [NowController, NowAdminController],
            providers: [
                { provide: NowService, useValue: svc },
                { provide: PlatformAccessService, useValue: { permissionsOf: jest.fn(async (u: { role: string }) => (u.role === 'admin' ? ['*'] : [])) } },
            ],
        })
            .overrideGuard(JwtAuthGuard)
            .useValue(fakeJwt)
            .compile();
        app = mod.createNestApplication();
        // Mismo pipe global que main.ts.
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
        await app.init();
    });
    afterAll(() => app.close());
    beforeEach(() => {
        Object.values(svc).forEach((f) => f.mockReset().mockResolvedValue({ ok: true }));
    });

    it('GET /now/feed, /now/mine y /now/friends llegan a su método (no los captura ninguna ruta :id)', async () => {
        await request(app.getHttpServer()).get('/now/feed?scope=nearby&lat=-12.05&lng=-77.04&page=2').set('x-user', user).expect(200);
        expect(svc.feed).toHaveBeenCalledWith(ME, expect.objectContaining({ scope: 'nearby', lat: -12.05, lng: -77.04, page: 2 }));
        await request(app.getHttpServer()).get('/now/mine?page=3').set('x-user', user).expect(200);
        expect(svc.mine).toHaveBeenCalledWith(ME, 3);
        await request(app.getHttpServer()).get('/now/friends').set('x-user', user).expect(200);
        expect(svc.listFriends).toHaveBeenCalledWith(ME);
    });

    it('feed, mine y amigos piden sesión', async () => {
        for (const url of ['/now/feed?scope=following', '/now/mine', '/now/friends']) await request(app.getHttpServer()).get(url).expect(401);
        await request(app.getHttpServer()).post(`/now/friends/${OTHER}`).expect(401);
        await request(app.getHttpServer()).delete(`/now/friends/${OTHER}`).expect(401);
        expect(svc.feed).not.toHaveBeenCalled();
    });

    it('feed rechaza scope ausente o desconocido, page inválida y lat que no es número (400)', async () => {
        for (const q of ['', '?scope=todos', '?scope=following&page=0', '?scope=following&page=1.5', '?scope=nearby&lat=abc&lng=1']) {
            await request(app.getHttpServer()).get(`/now/feed${q}`).set('x-user', user).expect(400);
        }
        expect(svc.feed).not.toHaveBeenCalled();
    });

    it('amigos: POST y DELETE por id de usuario (uuid)', async () => {
        await request(app.getHttpServer()).post(`/now/friends/${OTHER}`).set('x-user', user).expect(201);
        expect(svc.addFriend).toHaveBeenCalledWith(ME, OTHER);
        await request(app.getHttpServer()).delete(`/now/friends/${OTHER}`).set('x-user', user).expect(200);
        expect(svc.removeFriend).toHaveBeenCalledWith(ME, OTHER);
        await request(app.getHttpServer()).post('/now/friends/no-es-uuid').set('x-user', user).expect(400);
    });

    it('PATCH /admin/now/posts/:id solo acepta { hidden: false }: con true, sin body o con campos de más → 400', async () => {
        for (const body of [{ hidden: true }, {}, { hidden: 'si' }, { hidden: false, reports: 5 }]) {
            await request(app.getHttpServer()).patch(`/admin/now/posts/${POST}`).set('x-user', admin).send(body).expect(400);
        }
        expect(svc.restore).not.toHaveBeenCalled();
        await request(app.getHttpServer()).patch(`/admin/now/posts/${POST}`).set('x-user', admin).send({ hidden: false }).expect(200);
        expect(svc.restore).toHaveBeenCalledWith(POST);
    });

    it('/admin/now/*: solo el administrador (un usuario normal recibe 403, sin sesión 401)', async () => {
        const calls = [
            () => request(app.getHttpServer()).get('/admin/now/reported'),
            () => request(app.getHttpServer()).patch(`/admin/now/posts/${POST}`).send({ hidden: false }),
            () => request(app.getHttpServer()).delete(`/admin/now/posts/${POST}`),
        ];
        for (const call of calls) {
            await call().expect(401);
            await call().set('x-user', user).expect(403);
        }
        expect(svc.reported).not.toHaveBeenCalled();
        expect(svc.restore).not.toHaveBeenCalled();
        expect(svc.remove).not.toHaveBeenCalled();

        await request(app.getHttpServer()).get('/admin/now/reported').set('x-user', admin).expect(200);
        await request(app.getHttpServer()).delete(`/admin/now/posts/${POST}`).set('x-user', admin).expect(200);
        expect(svc.remove).toHaveBeenCalledWith(POST);
    });
});
