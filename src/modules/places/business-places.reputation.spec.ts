import { ForbiddenException } from '@nestjs/common';
import { BusinessPlacesController } from './business-places.controller';

describe('BusinessPlacesController — reputación', () => {
    const place: any = { id: 'p1', name: 'La Huarica', claimedByUserId: 'u1', metadata: { reviewAuto: { tone: 'formal' } } };
    let ctrl: any, placesRepo: any, ai: any, reputation: any;

    beforeEach(() => {
        placesRepo = { findOne: jest.fn().mockResolvedValue({ ...place, metadata: { ...place.metadata } }), save: jest.fn((p) => p) };
        ai = { chat: jest.fn().mockResolvedValue('Gracias') };
        reputation = { aiQuota: jest.fn().mockResolvedValue({ limit: 10, used: 3, remaining: 7 }), logSuggestion: jest.fn() };
        ctrl = Object.create(BusinessPlacesController.prototype);
        Object.assign(ctrl, { placesRepo, aiService: ai, reputationService: reputation });
    });

    it('sugerencia: usa el tono guardado, registra el uso y devuelve el cupo', async () => {
        const out = await ctrl.suggestGoogleReply('p1', { stars: 2, comment: 'Frío', reviewName: 'accounts/1/locations/2/reviews/r' }, { id: 'u1' });
        expect(ai.chat.mock.calls[0][0][0].content).toContain('formal');
        expect(reputation.logSuggestion).toHaveBeenCalledWith('p1', 'accounts/1/locations/2/reviews/r', 2);
        expect(out).toEqual({ reply: 'Gracias', quota: { limit: 10, used: 4, remaining: 6 } });
    });

    it('sugerencia sin cupo: 403 y no llama a la IA', async () => {
        reputation.aiQuota.mockResolvedValue({ limit: 10, used: 10, remaining: 0 });
        await expect(ctrl.suggestGoogleReply('p1', { stars: 5 }, { id: 'u1' })).rejects.toBeInstanceOf(ForbiddenException);
        expect(ai.chat).not.toHaveBeenCalled();
    });

    it('PATCH review-auto fusiona y valida sin perder lo guardado', async () => {
        const out = await ctrl.setReviewAuto('p1', { keywords: ['demoró'], alertsSince: '2000-01-01' }, { id: 'u1' });
        const saved = placesRepo.save.mock.calls[0][0].metadata.reviewAuto;
        expect(saved).toMatchObject({ tone: 'formal', keywords: ['demoró'] });
        expect(saved.alertsSince).toBeUndefined();
        expect(out).toMatchObject({ tone: 'formal', keywords: ['demoró'], alerts: true, googleConnected: false });
    });
});
