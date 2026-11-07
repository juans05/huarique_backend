import 'reflect-metadata';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NowService } from './now.service';
import { NowPost } from './entities/now-post.entity';
import { NowReaction } from './entities/now-reaction.entity';
import { NowReport } from './entities/now-report.entity';
import { ReactNowDto, ReportNowDto } from './dto/react-now.dto';

const HOUR = 3600_000;
const createdAt = new Date(Date.now() - HOUR);
const author = { id: 'a1', fullName: 'Ana Pérez', avatarUrl: null, email: 'ana@x.pe', phone: '999', passwordHash: 'x' };

const mkPost = (over: Record<string, any> = {}) => ({
    id: 'p1', authorId: 'a1', author, kind: 'text', text: 'hola', mediaUrl: null,
    latitude: -12.05, longitude: -77.04, visibility: 'all', likes: 0, dislikes: 0, checks: 0, reports: 0,
    hidden: false, hiddenReason: null, createdAt, expiresAt: new Date(createdAt.getTime() + 24 * HOUR), ...over,
});

const rx = (userId: string, type: string) => ({ postId: 'p1', userId, type });
const rp = (userId: string, at = new Date()) => ({ postId: 'p1', userId, createdAt: at });
const many = (type: string, ids: string[]) => ids.map((id) => rx(id, type));

/** Base de datos de mentira: el manager de la transacción lee y escribe `state`, así los conteos reflejan las filas. */
const build = (postOver: Record<string, any> = {}, seed: { reactions?: any[]; reports?: any[] } = {}) => {
    const state = { post: mkPost(postOver), reactions: [...(seed.reactions ?? [])], reports: [...(seed.reports ?? [])] };
    const manager = {
        query: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(async (E: any, o: any) => {
            if (E === NowPost) return state.post;
            if (E === NowReport) return state.reports.find((r) => r.postId === o.where.postId && r.userId === o.where.userId) ?? null;
            return null;
        }),
        count: jest.fn(async (E: any, o: any) => {
            const w = o.where;
            if (E === NowReaction) return state.reactions.filter((r) => r.postId === w.postId && r.type === w.type).length;
            const since: Date | undefined = w.createdAt?.value;
            return state.reports.filter((r) => (!w.postId || r.postId === w.postId) && (!w.userId || r.userId === w.userId) && (!since || r.createdAt > since)).length;
        }),
        upsert: jest.fn(async (_E: any, v: any) => {
            const i = state.reactions.findIndex((r) => r.postId === v.postId && r.userId === v.userId);
            if (i >= 0) state.reactions[i] = { ...v };
            else state.reactions.push({ ...v });
        }),
        delete: jest.fn(async (_E: any, w: any) => {
            state.reactions = state.reactions.filter((r) => !(r.postId === w.postId && r.userId === w.userId));
        }),
        insert: jest.fn(async (_E: any, v: any) => {
            state.reports.push({ ...v, createdAt: new Date() });
        }),
        update: jest.fn(async (_E: any, _w: any, patch: any) => {
            Object.assign(state.post, patch);
        }),
    };
    const posts = {
        manager: { transaction: jest.fn((cb) => cb(manager)) },
        findOne: jest.fn(async () => state.post),
        query: jest.fn().mockResolvedValue([{ d: 120 }]),
    };
    const reactions = { findOne: jest.fn().mockResolvedValue(null) };
    const friends = { count: jest.fn().mockResolvedValue(0) };
    const follows = { count: jest.fn().mockResolvedValue(0) };
    const svc = new NowService(posts as any, reactions as any, friends as any, follows as any, {} as any, {} as any);
    const distance = jest.spyOn(svc, 'distanceMeters').mockResolvedValue(100);
    return { svc, state, manager, posts, friends, follows, distance };
};

const react = (type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra }) as any;
const here = { latitude: -12.05, longitude: -77.04 };

describe('NowService.react', () => {
    it('✅ sin latitude/longitude → BadRequestException, sin tocar la base', async () => {
        const { svc, posts } = build();
        await expect(svc.react('u2', 'p1', react('check'))).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.react('u2', 'p1', react('check', { latitude: -12.05 }))).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.react('u2', 'p1', react('check', { latitude: 95, longitude: -77 }))).rejects.toBeInstanceOf(BadRequestException);
        expect(posts.manager.transaction).not.toHaveBeenCalled();
    });

    it('✅ a 301 m → ForbiddenException y no guarda; a 300 m sí', async () => {
        const { svc, state, distance } = build();
        distance.mockResolvedValue(301);
        await expect(svc.react('u2', 'p1', react('check', here))).rejects.toBeInstanceOf(ForbiddenException);
        expect(state.reactions).toHaveLength(0);
        distance.mockResolvedValue(300);
        const dto = await svc.react('u2', 'p1', react('check', here));
        expect(dto).toMatchObject({ checks: 1, myReaction: 'check' });
        expect(distance).toHaveBeenCalledWith('p1', -12.05, -77.04);
    });

    it('👍 y 👎 no piden ubicación ni miden distancia', async () => {
        const { svc, distance } = build();
        await svc.react('u2', 'p1', react('like'));
        await svc.react('u3', 'p1', react('dislike'));
        expect(distance).not.toHaveBeenCalled();
    });

    it('cambiar de 👍 a 👎 deja likes-1, dislikes+1 y recalcula expiresAt', async () => {
        const { svc, state } = build(
            { likes: 3, dislikes: 2, expiresAt: new Date(createdAt.getTime() + 25 * HOUR) },
            { reactions: [...many('like', ['u2', 'u3', 'u4']), ...many('dislike', ['u5', 'u6'])] },
        );
        const dto = await svc.react('u2', 'p1', react('dislike'));
        expect(state.post).toMatchObject({ likes: 2, dislikes: 3, checks: 0 });
        expect(state.post.expiresAt.getTime()).toBe(createdAt.getTime() + 23 * HOUR); // 24 + 2 − 3
        expect(state.reactions.filter((r) => r.userId === 'u2')).toEqual([rx('u2', 'dislike')]);
        expect(dto).toMatchObject({ likes: 2, dislikes: 3, checks: 0, myReaction: 'dislike' });
        expect(dto.expiresAt.getTime()).toBe(createdAt.getTime() + 23 * HOUR);
    });

    it('la misma reacción dos veces no cambia los contadores', async () => {
        const { svc, state } = build();
        const first = await svc.react('u2', 'p1', react('like'));
        const second = await svc.react('u2', 'p1', react('like'));
        expect(second).toMatchObject({ likes: 1, dislikes: 0, checks: 0 });
        expect(second.expiresAt).toEqual(first.expiresAt);
        expect(state.reactions).toHaveLength(1);
    });

    it('recalcula desde las filas: contadores desfasados por un usuario borrado en cascada se corrigen, sin negativos', async () => {
        const { svc, state } = build({ likes: 4, dislikes: 2, checks: 1 }, { reactions: [] });
        await svc.react('u2', 'p1', react('dislike'));
        expect(state.post).toMatchObject({ likes: 0, dislikes: 1, checks: 0 });
    });

    it("al cruzar el margen de 👎 marca hidden=true y hiddenReason='votes'", async () => {
        const { svc, state, manager } = build({ dislikes: 4 }, { reactions: many('dislike', ['u3', 'u4', 'u5', 'u6']) });
        await svc.react('u2', 'p1', react('dislike')); // 5 − 0 ≥ 5
        expect(state.post).toMatchObject({ dislikes: 5, hidden: true, hiddenReason: 'votes' });
        expect(manager.update).toHaveBeenCalledWith(NowPost, { id: 'p1' }, expect.objectContaining({ hidden: true, hiddenReason: 'votes' }));
    });

    it('4 👎 netos todavía no ocultan', async () => {
        const { svc, state } = build({}, { reactions: [...many('dislike', ['u3', 'u4', 'u5', 'u6']), ...many('like', ['u7'])] });
        await svc.react('u2', 'p1', react('dislike')); // 5 − 1 = 4
        expect(state.post).toMatchObject({ hidden: false, hiddenReason: null });
    });

    it("si los votos se recuperan, quita hidden solo cuando el motivo era 'votes'", async () => {
        // Carrera: la lectura previa la ve visible, pero otra petición ya la ocultó por votos.
        const votes = build({ hidden: true, hiddenReason: 'votes' }, { reactions: many('dislike', ['u2', 'u3', 'u4', 'u5', 'u6']) });
        votes.posts.findOne.mockResolvedValue(mkPost() as any);
        await votes.svc.react('u2', 'p1', react('like')); // 4 − 1 = 3
        expect(votes.state.post).toMatchObject({ hidden: false, hiddenReason: null });

        const reports = build({ hidden: true, hiddenReason: 'reports' }, { reactions: many('dislike', ['u2', 'u3', 'u4', 'u5', 'u6']) });
        reports.posts.findOne.mockResolvedValue(mkPost() as any);
        await reports.svc.react('u2', 'p1', react('like'));
        expect(reports.state.post).toMatchObject({ hidden: true, hiddenReason: 'reports' });
    });

    it('bloquea la fila de la publicación antes de escribir la reacción', async () => {
        const { svc, manager } = build();
        await svc.react('u2', 'p1', react('like'));
        expect(manager.findOne).toHaveBeenCalledWith(NowPost, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
        expect(manager.findOne.mock.invocationCallOrder[0]).toBeLessThan(manager.upsert.mock.invocationCallOrder[0]);
        expect(manager.upsert.mock.invocationCallOrder[0]).toBeLessThan(manager.count.mock.invocationCallOrder[0]);
    });

    it('responde el NowPostDto sin datos privados del autor', async () => {
        const { svc } = build();
        const dto = await svc.react('u2', 'p1', react('like'));
        expect(dto.author).toEqual({ id: 'a1', fullName: 'Ana Pérez', avatarUrl: null });
        expect(JSON.stringify(dto)).not.toMatch(/ana@x\.pe|999|passwordHash|hidden/);
    });

    it('404 si la publicación no existe, venció, está oculta o el usuario no puede verla', async () => {
        const gone = build();
        gone.posts.findOne.mockResolvedValue(null as any);
        await expect(gone.svc.react('u2', 'p1', react('like'))).rejects.toBeInstanceOf(NotFoundException);

        for (const over of [{ expiresAt: new Date(Date.now() - 1000) }, { hidden: true, hiddenReason: 'reports' }]) {
            const { svc, posts } = build(over);
            await expect(svc.react('u2', 'p1', react('like'))).rejects.toBeInstanceOf(NotFoundException);
            await expect(svc.unreact('u2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
            expect(posts.manager.transaction).not.toHaveBeenCalled();
        }

        const friends = build({ visibility: 'friends' });
        friends.follows.count.mockResolvedValue(1); // lo sigue, pero no es amigo
        await expect(friends.svc.react('u2', 'p1', react('like'))).rejects.toBeInstanceOf(NotFoundException);
        // y el 403 por distancia no delata dónde está: ni siquiera se mide
        await expect(friends.svc.react('u2', 'p1', react('check', here))).rejects.toBeInstanceOf(NotFoundException);
        expect(friends.distance).not.toHaveBeenCalled();
    });

    it("deja reaccionar a un amigo en 'friends'", async () => {
        const { svc, friends } = build({ visibility: 'friends' });
        friends.count.mockResolvedValue(1);
        await expect(svc.react('u2', 'p1', react('like'))).resolves.toMatchObject({ likes: 1 });
    });
});

describe('NowService.unreact', () => {
    it('borra la reacción, recalcula y responde con myReaction null', async () => {
        const { svc, state } = build({ likes: 2 }, { reactions: many('like', ['u2', 'u3']) });
        const dto = await svc.unreact('u2', 'p1');
        expect(state.reactions).toEqual([rx('u3', 'like')]);
        expect(state.post).toMatchObject({ likes: 1 });
        expect(dto).toMatchObject({ likes: 1, myReaction: null });
        expect(dto.expiresAt.getTime()).toBe(createdAt.getTime() + 25 * HOUR);
    });

    it('sin reacción previa no cambia nada (ni baja de cero)', async () => {
        const { svc, state } = build();
        const dto = await svc.unreact('u2', 'p1');
        expect(state.post).toMatchObject({ likes: 0, dislikes: 0, checks: 0 });
        expect(dto.myReaction).toBeNull();
    });
});

describe('NowService.distanceMeters', () => {
    it('mide con ST_Distance sobre geography (lng, lat) y devuelve metros', async () => {
        const { svc, posts } = build();
        (svc.distanceMeters as jest.Mock).mockRestore();
        posts.query.mockResolvedValue([{ d: '123.4' }]);
        await expect(svc.distanceMeters('p1', -12.05, -77.04)).resolves.toBe(123.4);
        const [sql, params] = posts.query.mock.calls[0];
        expect(sql).toMatch(/ST_Distance\(location, ST_SetSRID\(ST_MakePoint\(\$2, \$3\), 4326\)::geography\)/);
        expect(sql).toContain('wuarike_db.now_posts');
        expect(params).toEqual(['p1', -77.04, -12.05]);
    });

    it('404 si la publicación ya no existe', async () => {
        const { svc, posts } = build();
        (svc.distanceMeters as jest.Mock).mockRestore();
        posts.query.mockResolvedValue([]);
        await expect(svc.distanceMeters('p1', 0, 0)).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('NowService.report', () => {
    it("el tercer reporte de usuarios distintos marca hidden=true y hiddenReason='reports'", async () => {
        const { svc, state } = build();
        await svc.report('u2', 'p1', 'spam');
        await svc.report('u3', 'p1', 'spam');
        expect(state.post).toMatchObject({ reports: 2, hidden: false });
        await expect(svc.report('u4', 'p1', 'spam')).resolves.toEqual({ ok: true });
        expect(state.post).toMatchObject({ reports: 3, hidden: true, hiddenReason: 'reports' });
    });

    it('el mismo usuario reportando dos veces cuenta una sola vez', async () => {
        const { svc, state, manager } = build();
        await svc.report('u2', 'p1', 'spam');
        await expect(svc.report('u2', 'p1', 'otra vez')).resolves.toEqual({ ok: true });
        await svc.report('u3', 'p1', 'spam');
        expect(manager.insert).toHaveBeenCalledTimes(2);
        expect(state.post).toMatchObject({ reports: 2, hidden: false });
    });

    it('un reporte repetido no cuenta contra el límite diario', async () => {
        const { svc, manager } = build({}, { reports: [rp('u2')] });
        manager.count.mockResolvedValue(20);
        await expect(svc.report('u2', 'p1', 'spam')).resolves.toEqual({ ok: true });
        expect(manager.insert).not.toHaveBeenCalled();
    });

    it('limita a 20 reportes por día por usuario (429) y no inserta', async () => {
        const old = new Date(Date.now() - 25 * HOUR);
        const day = Array.from({ length: 20 }, (_, i) => ({ postId: `x${i}`, userId: 'u2', createdAt: new Date() }));
        const { svc, manager, state } = build({}, { reports: [...day, { postId: 'viejo', userId: 'u2', createdAt: old }] });
        const err = await svc.report('u2', 'p1', 'spam').catch((e) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(429);
        expect(manager.insert).not.toHaveBeenCalled();
        expect(state.post.reports).toBe(0);
    });

    it('19 reportes en el día todavía dejan reportar; los de hace más de 24 h no cuentan', async () => {
        const old = new Date(Date.now() - 25 * HOUR);
        const day = Array.from({ length: 19 }, (_, i) => ({ postId: `x${i}`, userId: 'u2', createdAt: new Date() }));
        const older = Array.from({ length: 5 }, (_, i) => ({ postId: `o${i}`, userId: 'u2', createdAt: old }));
        const { svc, manager } = build({}, { reports: [...day, ...older] });
        await expect(svc.report('u2', 'p1', 'spam')).resolves.toEqual({ ok: true });
        expect(manager.insert).toHaveBeenCalledTimes(1);
    });

    it('toma el candado asesor de quien reporta antes de contar e insertar', async () => {
        const { svc, manager } = build();
        await svc.report('u2', 'p1', 'spam');
        expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock(hashtext($1))'), [expect.stringContaining('u2')]);
        const lock = manager.query.mock.invocationCallOrder[0];
        expect(lock).toBeLessThan(manager.count.mock.invocationCallOrder[0]);
        expect(manager.count.mock.invocationCallOrder[0]).toBeLessThan(manager.insert.mock.invocationCallOrder[0]);
        expect(manager.findOne).toHaveBeenCalledWith(NowPost, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    });

    it('guarda el motivo recortado (o null si queda vacío)', async () => {
        const { svc, manager } = build();
        await svc.report('u2', 'p1', '  me parece falso  ');
        await svc.report('u3', 'p1', '   ');
        expect(manager.insert).toHaveBeenNthCalledWith(1, NowReport, { postId: 'p1', userId: 'u2', reason: 'me parece falso' });
        expect(manager.insert).toHaveBeenNthCalledWith(2, NowReport, { postId: 'p1', userId: 'u3', reason: null });
    });

    it('recuenta desde las filas: reportes de usuarios borrados no dejan el contador inflado', async () => {
        const { svc, state } = build({ reports: 7 }, { reports: [rp('u3')] });
        await svc.report('u2', 'p1', 'spam');
        expect(state.post).toMatchObject({ reports: 2, hidden: false });
    });

    it('no puedes reportar tu propia publicación (400)', async () => {
        const { svc, posts } = build();
        await expect(svc.report('a1', 'p1', 'spam')).rejects.toBeInstanceOf(BadRequestException);
        expect(posts.manager.transaction).not.toHaveBeenCalled();
    });

    it('404 si no existe, venció, está oculta o no la puedes ver', async () => {
        for (const over of [{ expiresAt: new Date(Date.now() - 1000) }, { hidden: true, hiddenReason: 'votes' }, { visibility: 'followers' }]) {
            const { svc, posts } = build(over);
            await expect(svc.report('u2', 'p1', 'spam')).rejects.toBeInstanceOf(NotFoundException);
            expect(posts.manager.transaction).not.toHaveBeenCalled();
        }
        const gone = build();
        gone.posts.findOne.mockResolvedValue(null as any);
        await expect(gone.svc.report('u2', 'p1', 'spam')).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('ReactNowDto / ReportNowDto', () => {
    // Igual que el ValidationPipe global.
    const check = (cls: any, body: Record<string, unknown>) =>
        validate(plainToInstance(cls, body, { enableImplicitConversion: true }), { whitelist: true, forbidNonWhitelisted: true });

    it('acepta like, dislike y check con o sin ubicación', async () => {
        expect(await check(ReactNowDto, { type: 'like' })).toHaveLength(0);
        expect(await check(ReactNowDto, { type: 'check', latitude: -12.05, longitude: -77.04 })).toHaveLength(0);
    });

    it('rechaza un tipo desconocido, coordenadas que no son número y campos de más', async () => {
        expect((await check(ReactNowDto, { type: 'love' })).map((e) => e.property)).toContain('type');
        expect((await check(ReactNowDto, { type: 'check', latitude: 'abc', longitude: 1 })).map((e) => e.property)).toContain('latitude');
        expect(await check(ReactNowDto, { type: 'like', userId: 'x' })).not.toHaveLength(0);
    });

    it('el reporte pide un motivo de hasta 200 caracteres', async () => {
        expect(await check(ReportNowDto, { reason: 'spam' })).toHaveLength(0);
        expect(await check(ReportNowDto, {})).not.toHaveLength(0);
        expect(await check(ReportNowDto, { reason: 'x'.repeat(201) })).not.toHaveLength(0);
    });
});
