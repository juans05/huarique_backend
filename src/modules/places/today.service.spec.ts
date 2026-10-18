import { FindOperator } from 'typeorm';
import { TodayService } from './today.service';

const DAY = 86400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

// Evalúa en memoria los filtros que usa el servicio (igualdad, LessThan, MoreThanOrEqual), para que los tests
// comprueben QUÉ tarjetas cuentan y no solo que se llamó a count().
const matches = (row: any, where: Record<string, any>) =>
    Object.entries(where).every(([key, cond]) => {
        if (!(cond instanceof FindOperator)) return row[key] === cond;
        if (row[key] == null) return false;
        if (cond.type === 'lessThan') return row[key] < cond.value;
        if (cond.type === 'moreThanOrEqual') return row[key] >= cond.value;
        throw new Error(`operador no soportado en el test: ${cond.type}`);
    });

const card = (over: Record<string, any> = {}) => ({
    placeId: 'p1', marketingConsent: true, totalVisits: 1, lastVisitAt: null, lastWinbackSentAt: null, ...over,
});

const msg = (messageType: 'INCOMING' | 'OUTGOING', isFromAi = false) => ({ messageType, isFromAi });

interface Opts {
    chats?: ReturnType<typeof msg>[][]; // mensajes (en orden) de cada chat humano abierto
    counts?: { botChats: string; weekChats: string };
    cards?: any[];
    program?: any;
    newOrders?: number;
    place?: any;
    reviews?: any[];
    googleError?: Error;
}

const build = (o: Opts = {}) => {
    const messageRepo = {
        query: jest.fn(async (sql: string) =>
            sql.includes('DISTINCT ON') // el último mensaje de cada chat, como el DISTINCT ON de la consulta real
                ? (o.chats ?? []).map((messages) => messages[messages.length - 1])
                : [o.counts ?? { botChats: '0', weekChats: '0' }]),
    };
    const cardRepo = { count: jest.fn(async ({ where }: any) => (o.cards ?? []).filter((c) => matches(c, where)).length) };
    const programRepo = { findOne: jest.fn().mockResolvedValue(o.program ?? null) };
    const orderRepo = { count: jest.fn().mockResolvedValue(o.newOrders ?? 0) };
    const placeRepo = {
        findOne: jest.fn().mockResolvedValue(o.place === undefined ? { id: 'p1', googleLocationName: null, googleRating: null } : o.place),
    };
    const google = {
        getAllReviews: jest.fn(async () => {
            if (o.googleError) throw o.googleError;
            return { reviews: o.reviews ?? [], total: (o.reviews ?? []).length, averageRating: null };
        }),
    };
    const store = new Map<string, string>();
    const redis = {
        get: jest.fn(async (k: string) => store.get(k) ?? null),
        set: jest.fn(async (k: string, v: string) => { store.set(k, v); return 'OK'; }),
        disconnect: jest.fn(),
    };
    const svc = new TodayService(
        { get: jest.fn() } as any, messageRepo as any, cardRepo as any, programRepo as any,
        orderRepo as any, placeRepo as any, google as any, () => redis,
    );
    svc.onModuleInit();
    return { svc, messageRepo, cardRepo, programRepo, orderRepo, placeRepo, google, redis };
};

describe('TodayService.getToday', () => {
    it('cuenta el chat humano cuyo último mensaje es entrante y no el que ya respondió el equipo', async () => {
        const { svc, messageRepo } = build({
            chats: [
                [msg('INCOMING')], // el cliente espera
                [msg('INCOMING'), msg('OUTGOING')], // ya respondió una persona
                [msg('INCOMING'), msg('OUTGOING'), msg('INCOMING'), msg('OUTGOING')],
            ],
        });
        expect((await svc.getToday('p1')).pendingHumanChats).toBe(1);
        const sql = messageRepo.query.mock.calls.find(([s]) => s.includes('DISTINCT ON'))![0] as string;
        expect(sql).toContain("c.mode = 'human'");
        expect(sql).toContain("c.status <> 'cerrado'");
    });

    it('un chat que el menú del bot derivó a una persona cuenta como pendiente hasta que alguien del equipo responde', async () => {
        // El cliente elige "hablar con alguien"; el bot confirma (OUTGOING del bot) y la conversación pasa a modo humano.
        const handoff = [msg('INCOMING'), msg('OUTGOING', true), msg('INCOMING'), msg('OUTGOING', true)];
        expect((await build({ chats: [handoff] }).svc.getToday('p1')).pendingHumanChats).toBe(1);
        // Responde el operador (isFromAi: false): ya no está pendiente.
        expect((await build({ chats: [[...handoff, msg('OUTGOING')]] }).svc.getToday('p1')).pendingHumanChats).toBe(0);
    });

    it('una tarjeta sin consentimiento, con visita reciente o sin visita no suma a inactiveLoyalCustomers', async () => {
        const { svc } = build({
            cards: [
                card({ lastVisitAt: daysAgo(40) }), // cuenta
                card({ lastVisitAt: daysAgo(40), marketingConsent: false }), // sin consentimiento
                card({ lastVisitAt: daysAgo(5) }), // visita reciente
                card({ lastVisitAt: null }), // nunca visitó
                card({ lastVisitAt: daysAgo(40), placeId: 'otro' }), // otro local
            ],
        });
        expect((await svc.getToday('p1')).inactiveLoyalCustomers).toBe(1);
    });

    it('arma el resumen: bot, winback, pedidos y stats de la semana', async () => {
        const { svc, orderRepo } = build({
            counts: { botChats: '4', weekChats: '9' },
            program: { winbackEnabled: true, isActive: true },
            newOrders: 3,
            place: { id: 'p1', googleLocationName: 'locations/1', googleRating: '4.60' },
            cards: [
                card({ totalVisits: 3, lastVisitAt: daysAgo(2), lastWinbackSentAt: daysAgo(3) }), // volvió + winback
                card({ totalVisits: 1, lastVisitAt: daysAgo(2) }), // una sola visita: no "volvió"
                card({ totalVisits: 5, lastVisitAt: daysAgo(20), lastWinbackSentAt: daysAgo(10) }), // fuera de la semana
                card({ totalVisits: 2, lastVisitAt: daysAgo(45) }), // inactiva > 30 días
            ],
        });
        expect(await svc.getToday('p1')).toEqual({
            botChatsSince24h: 4,
            pendingHumanChats: 0,
            inactiveLoyalCustomers: 1,
            winbackEnabled: true,
            winbacksSentThisWeek: 1,
            newOrders: 3,
            weekStats: { chats: 9, returningCustomers: 1, googleRating: 4.6 },
        });
        expect(orderRepo.count).toHaveBeenCalledWith({ where: { placeId: 'p1', status: 'NUEVO' } });
    });

    it('winbackEnabled exige programa activo: el envío diario solo corre con winbackEnabled e isActive', async () => {
        expect((await build({ program: { winbackEnabled: true, isActive: false } }).svc.getToday('p1')).winbackEnabled).toBe(false);
        expect((await build({ program: { winbackEnabled: false, isActive: true } }).svc.getToday('p1')).winbackEnabled).toBe(false);
    });

    it('sin programa de fidelización, winbackEnabled es false; sin local, la calificación es null', async () => {
        const { svc } = build({ program: null, place: null });
        const res = await svc.getToday('p1');
        expect(res.winbackEnabled).toBe(false);
        expect(res.weekStats.googleRating).toBeNull();
    });
});

describe('TodayService.getReviewsToday', () => {
    const withLocation = { id: 'p1', googleLocationName: 'locations/1', googleRating: null };

    it('sin googleLocationName devuelve connected:false sin llamar a Google', async () => {
        const { svc, google } = build();
        expect(await svc.getReviewsToday('p1')).toEqual({ connected: false, unanswered: 0 });
        expect(google.getAllReviews).not.toHaveBeenCalled();
    });

    it('cuenta solo las reseñas sin reviewReply', async () => {
        const { svc } = build({
            place: withLocation,
            reviews: [{ name: 'a' }, { name: 'b', reviewReply: { comment: 'gracias' } }, { name: 'c', reviewReply: null }],
        });
        expect(await svc.getReviewsToday('p1')).toEqual({ connected: true, unanswered: 2 });
    });

    it('si Google falla devuelve { connected: true, unanswered: 0 } sin lanzar', async () => {
        const { svc } = build({ place: withLocation, googleError: new Error('Google caído') });
        await expect(svc.getReviewsToday('p1')).resolves.toEqual({ connected: true, unanswered: 0 });
    });

    it('si Google falla, cachea el fallo 60 s y las siguientes cargas de Inicio no vuelven a llamarlo', async () => {
        const { svc, google, redis } = build({ place: withLocation, googleError: new Error('Google caído') });
        expect(await svc.getReviewsToday('p1')).toEqual({ connected: true, unanswered: 0 });
        expect(await svc.getReviewsToday('p1')).toEqual({ connected: true, unanswered: 0 });
        expect(google.getAllReviews).toHaveBeenCalledTimes(1);
        expect(redis.set).toHaveBeenCalledWith('today:reviews:p1', '0', 'EX', 60);
    });

    it('la segunda llamada sale de la caché de Redis (Google se llama una sola vez, TTL 600 s)', async () => {
        const { svc, google, redis } = build({ place: withLocation, reviews: [{ name: 'a' }, { name: 'b' }] });
        expect(await svc.getReviewsToday('p1')).toEqual({ connected: true, unanswered: 2 });
        expect(await svc.getReviewsToday('p1')).toEqual({ connected: true, unanswered: 2 });
        expect(google.getAllReviews).toHaveBeenCalledTimes(1);
        expect(redis.set).toHaveBeenCalledWith('today:reviews:p1', '2', 'EX', 600);
    });

    it('si Redis falla, consulta a Google igual y no rompe', async () => {
        const { svc, google, redis } = build({ place: withLocation, reviews: [{ name: 'a' }] });
        redis.get.mockRejectedValue(new Error('Redis caído'));
        redis.set.mockRejectedValue(new Error('Redis caído'));
        expect(await svc.getReviewsToday('p1')).toEqual({ connected: true, unanswered: 1 });
        expect(google.getAllReviews).toHaveBeenCalledTimes(1);
    });
});
