import { ReputationService } from './reputation.service';

const review = (name: string, starRating: string, extra: any = {}) =>
    ({ name, starRating, createTime: '2026-10-14T10:00:00Z', reviewer: { displayName: 'Ana Pérez' }, comment: 'x', ...extra });

describe('ReputationService', () => {
    let replies: any, google: any, ai: any, subs: any, svc: ReputationService;
    const place: any = { id: 'p1', name: 'La Huarica', metadata: {} };

    beforeEach(() => {
        replies = {
            count: jest.fn().mockResolvedValue(0),
            find: jest.fn().mockResolvedValue([]),
            insert: jest.fn(),
            update: jest.fn(),
        };
        google = { replyToReview: jest.fn(), getAllReviews: jest.fn() };
        ai = { chat: jest.fn().mockResolvedValue(' Gracias Ana ') };
        subs = { getSubscriptionForPlace: jest.fn().mockResolvedValue(null) };
        svc = new ReputationService(replies, google, ai, subs);
    });

    it('cupo: 10 sin plan, 1000 con Fidelización+ activa, cuenta IA del mes', async () => {
        replies.count.mockResolvedValue(4);
        expect(await svc.aiQuota('p1')).toEqual({ limit: 10, used: 4, remaining: 6 });
        subs.getSubscriptionForPlace.mockResolvedValue({ status: 'active', tier: 'fidelizacion' });
        expect((await svc.aiQuota('p1')).limit).toBe(1000);
        subs.getSubscriptionForPlace.mockResolvedValue({ status: 'canceled', tier: 'ia_total' });
        expect((await svc.aiQuota('p1')).limit).toBe(10);
    });

    it('si la reseña ya tiene respuesta, cancela sin llamar a Google', async () => {
        await svc.publishJob(place, { id: 'j1', attempts: 0 } as any, review('r1', 'FIVE', { reviewReply: { comment: 'hola' } }));
        expect(replies.update).toHaveBeenCalledWith('j1', { status: 'cancelada' });
        expect(google.replyToReview).not.toHaveBeenCalled();
    });

    it('si la reseña ya no existe, cancela', async () => {
        await svc.publishJob(place, { id: 'j1', attempts: 0 } as any, undefined);
        expect(replies.update).toHaveBeenCalledWith('j1', { status: 'cancelada' });
    });

    it('con cupo publica texto de IA', async () => {
        await svc.publishJob(place, { id: 'j1', attempts: 0 } as any, review('r1', 'FIVE'));
        expect(google.replyToReview).toHaveBeenCalledWith('p1', 'r1', 'Gracias Ana');
        expect(replies.update).toHaveBeenCalledWith('j1', expect.objectContaining({ status: 'publicada', aiGenerated: true, replyText: 'Gracias Ana' }));
    });

    it('sin cupo: 5 ★ sale con plantilla, 2 ★ queda sin_cupo', async () => {
        replies.count.mockResolvedValue(10);
        await svc.publishJob(place, { id: 'j1', attempts: 0 } as any, review('r1', 'FIVE'));
        expect(ai.chat).not.toHaveBeenCalled();
        expect(replies.update).toHaveBeenCalledWith('j1', expect.objectContaining({ status: 'publicada', aiGenerated: false }));
        expect(google.replyToReview.mock.calls[0][2]).toContain('Ana');

        await svc.publishJob(place, { id: 'j2', attempts: 0 } as any, review('r2', 'TWO'));
        expect(replies.update).toHaveBeenCalledWith('j2', { status: 'sin_cupo' });
        expect(google.replyToReview).toHaveBeenCalledTimes(1);
    });

    it('error de Google: reintenta una vez y luego queda en error, sin volver a gastar IA', async () => {
        google.replyToReview.mockRejectedValue(new Error('boom'));
        await svc.publishJob(place, { id: 'j1', attempts: 0 } as any, review('r1', 'FIVE'));
        expect(replies.update).toHaveBeenCalledWith('j1', expect.objectContaining({ status: 'programada', attempts: 1, replyText: 'Gracias Ana', aiGenerated: true }));
        ai.chat.mockClear();
        await svc.publishJob(place, { id: 'j1', attempts: 1, replyText: 'Gracias Ana' } as any, review('r1', 'FIVE'));
        expect(ai.chat).not.toHaveBeenCalled();
        expect(replies.update).toHaveBeenLastCalledWith('j1', expect.objectContaining({ status: 'error', attempts: 2 }));
    });

    it('scheduleAuto ignora reseñas con cualquier fila auto/lote (también canceladas)', async () => {
        replies.find.mockResolvedValue([{ reviewName: 'r1' }]);
        const now = Date.parse('2026-10-14T12:00:00Z');
        const n = await svc.scheduleAuto('p1', [review('r1', 'FIVE'), review('r2', 'FOUR')], { enabled: true, stars: [4, 5], delayMin: 30, delayMax: 180 }, now);
        expect(n).toBe(1);
        const rows = replies.insert.mock.calls[0][0];
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ placeId: 'p1', reviewName: 'r2', stars: 4, origin: 'auto', status: 'programada' });
        const at = rows[0].scheduledAt.getTime();
        expect(at).toBeGreaterThanOrEqual(now + 30 * 60_000);
        expect(at).toBeLessThanOrEqual(now + 180 * 60_000);
    });

    it('enqueueBulk: solo sin responder, con las estrellas pedidas, sin filas vivas y con tope', async () => {
        google.getAllReviews.mockResolvedValue({
            reviews: [review('r1', 'FIVE'), review('r2', 'FIVE', { reviewReply: { comment: 'ya' } }), review('r3', 'ONE'), review('r4', 'FOUR'), review('r5', 'FIVE')],
        });
        replies.find.mockResolvedValue([{ reviewName: 'r5' }]);
        const out = await svc.enqueueBulk('p1', { stars: [4, 5, 9], max: 1 });
        expect(replies.insert.mock.calls[0][0].map((r: any) => r.reviewName)).toEqual(['r1']);
        expect(out).toEqual({ encoladas: 1, cupoIaRestante: 10 });
    });
});
