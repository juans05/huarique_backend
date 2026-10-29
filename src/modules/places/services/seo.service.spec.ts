import { SeoService, fromBusinessProfile, fromPlacesDetails } from './seo.service';

const NOW = Date.parse('2026-10-14T12:00:00Z');

describe('SeoService', () => {
    it('mapea la ficha de Google Business', () => {
        const input = fromBusinessProfile(
            {
                profile: {
                    title: 'La Huarica', phoneNumbers: { primaryPhone: '01 555' }, websiteUri: 'https://x.pe',
                    storefrontAddress: { addressLines: ['Av. 1'] }, regularHours: { periods: [{}] },
                    categories: { primaryCategory: { displayName: 'Restaurante' }, additionalCategories: [{}, {}] },
                    profile: { description: 'a'.repeat(300) }, serviceItems: [{}, {}],
                },
                mediaItems: [
                    { createTime: '2026-10-01T00:00:00Z', locationAssociation: { category: 'COVER' } },
                    { createTime: '2025-01-01T00:00:00Z', locationAssociation: { category: 'PROFILE' } },
                ],
                totalMedia: 12,
            },
            {
                reviews: [
                    { createTime: '2026-10-10T00:00:00Z', reviewReply: { comment: 'ok', updateTime: '2026-10-12T12:00:00Z' } },
                    { createTime: '2026-08-01T00:00:00Z' },
                ],
                total: 2, averageRating: 4.6,
            },
            true,
            NOW,
        );
        expect(input).toMatchObject({
            estimated: false, name: true, address: true, phone: true, website: true, hours: true, primaryCategory: true,
            extraCategories: 2, descriptionLength: 300, rating: 4.6, reviewCount: 2, responseRate: 0.5,
            hasCover: true, hasLogo: true, photoCount: 12, recentPhotos90d: 1, serviceItems: 2, hasMenu: true,
            reviewsLast30d: 1, daysSinceLastReply: 2,
        });
    });

    it('mapea Places (estimado) dejando null lo que no se puede medir', () => {
        const input = fromPlacesDetails({ name: 'X', formatted_address: 'A', rating: 4.2, user_ratings_total: 80, photos: [{}, {}] }, false);
        expect(input).toMatchObject({ estimated: true, name: true, phone: false, rating: 4.2, reviewCount: 80, photoCount: 2, responseRate: null, hasCover: null });
    });

    it('no recalcula más de una vez cada 10 minutos', async () => {
        const cached = { score: 50, at: new Date(NOW - 5 * 60_000).toISOString() };
        const placesRepo: any = { findOne: jest.fn().mockResolvedValue({ id: 'p1', metadata: { seoScore: cached } }), query: jest.fn() };
        const google: any = { getLocationProfile: jest.fn() };
        const svc = new SeoService(placesRepo, google, {} as any, {} as any);
        expect(await svc.recalculate('p1', NOW)).toBe(cached);
        expect(google.getLocationProfile).not.toHaveBeenCalled();
    });

    it('con OAuth pero sin aprobación de Google (cuota 0) cae al puntaje estimado', async () => {
        const placesRepo: any = {
            findOne: jest.fn().mockResolvedValue({ id: 'p1', googleAccessToken: 't', googleLocationName: 'accounts/1/locations/2', googlePlaceId: 'gp', metadata: {} }),
            query: jest.fn(),
        };
        const google: any = { getLocationProfile: jest.fn().mockRejectedValue(new Error('falta la aprobación de Google')), getAllReviews: jest.fn().mockResolvedValue({ reviews: [], total: 0, averageRating: null }) };
        const maps: any = { getSeoDetails: jest.fn().mockResolvedValue({ name: 'X', rating: 4.5, user_ratings_total: 10 }) };
        const dishes: any = { count: jest.fn().mockResolvedValue(0) };
        const out = await new SeoService(placesRepo, google, maps, dishes).recalculate('p1', NOW);
        expect(out.estimated).toBe(true);
        expect(maps.getSeoDetails).toHaveBeenCalledWith('gp');
        expect(placesRepo.query).toHaveBeenCalledWith(expect.stringContaining('wuarike_db.places'), ['p1', expect.any(String)]);
    });
});
