import { ReviewAutoService } from './review-auto.service';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const r = (name: string, starRating: string, createTime: string, extra: any = {}) =>
    ({ name, starRating, createTime, updateTime: createTime, comment: '', reviewer: { displayName: 'Ana' }, ...extra });

describe('ReviewAutoService.processPlace', () => {
    let placesRepo: any, google: any, mail: any, reputation: any, svc: ReviewAutoService;
    const basePlace = (reviewAuto: any) => ({ id: 'p1', name: 'La Huarica', claimedBy: { email: 'dueno@x.pe' }, metadata: { reviewAuto } }) as any;

    beforeEach(() => {
        placesRepo = { query: jest.fn(), createQueryBuilder: jest.fn() };
        google = { getRecentReviews: jest.fn().mockResolvedValue([]), getAllReviews: jest.fn() };
        mail = { sendLowRatingAlert: jest.fn() };
        reputation = { dueJobs: jest.fn().mockResolvedValue([]), scheduleAuto: jest.fn(), publishJob: jest.fn() };
        svc = new ReviewAutoService(placesRepo, google, mail, reputation);
    });

    it('sin alertas, sin auto-respuesta y sin cola no llama a Google', async () => {
        await svc.processPlace(basePlace({ alerts: false }), NOW);
        expect(google.getRecentReviews).not.toHaveBeenCalled();
    });

    it('alerta reseñas nuevas bajas o con palabra clave, no las viejas', async () => {
        google.getRecentReviews.mockResolvedValue([
            r('a', 'TWO', '2026-10-14T11:58:00Z'),
            r('b', 'FIVE', '2026-10-14T11:59:00Z', { comment: 'Rico pero demoró' }),
            r('c', 'ONE', '2026-10-14T11:00:00Z'),
        ]);
        await svc.processPlace(basePlace({ alertsSince: '2026-10-14T11:55:00Z', keywords: ['demoro'], alertEmail: 'jefe@x.pe' }), NOW);
        expect(mail.sendLowRatingAlert).toHaveBeenCalledTimes(2);
        expect(mail.sendLowRatingAlert).toHaveBeenCalledWith('dueno@x.pe', 'La Huarica', expect.objectContaining({ stars: 5, keywords: ['demoro'], cc: 'jefe@x.pe' }));
    });

    it('programa solo 4–5 ★ nuevas y sin respuesta', async () => {
        google.getRecentReviews.mockResolvedValue([
            r('a', 'FIVE', '2026-10-14T11:00:00Z'),
            r('b', 'FOUR', '2026-10-14T11:00:00Z', { reviewReply: { comment: 'ya' } }),
            r('c', 'TWO', '2026-10-14T11:00:00Z'),
            r('d', 'FIVE', '2026-10-01T00:00:00Z'),
        ]);
        const auto = { enabled: true, stars: [4, 5], delayMin: 30, delayMax: 180, since: '2026-10-10T00:00:00Z' };
        await svc.processPlace(basePlace({ alerts: false, autoReply: auto }), NOW);
        expect(reputation.scheduleAuto.mock.calls[0][1].map((x: any) => x.name)).toEqual(['a']);
    });

    it('publica la cola con la reseña recién bajada; con trabajos en lote baja todas', async () => {
        reputation.dueJobs.mockResolvedValue([{ id: 'j1', reviewName: 'z', origin: 'lote' }]);
        google.getAllReviews.mockResolvedValue({ reviews: [r('z', 'FIVE', '2025-01-01T00:00:00Z')] });
        await svc.processPlace(basePlace({ alerts: false }), NOW);
        expect(google.getAllReviews).toHaveBeenCalledWith('p1');
        expect(reputation.publishJob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'j1' }), expect.objectContaining({ name: 'z' }));
    });

    it('solo toca reviewAuto.alertsSince con SQL, sin reescribir la configuración', async () => {
        await svc.processPlace(basePlace({ keywords: ['x'] }), NOW);
        expect(placesRepo.query).toHaveBeenCalledWith(expect.stringContaining("jsonb_build_object('alertsSince'"), ['p1', new Date(NOW).toISOString()]);
    });
});
