import { computeSeoScore, SeoInput } from './seo-score.util';

const full: SeoInput = {
    estimated: false, name: true, address: true, phone: true, website: true, hours: true,
    primaryCategory: true, extraCategories: 3, descriptionLength: 400,
    rating: 4.8, reviewCount: 250, responseRate: 0.9,
    hasCover: true, hasLogo: true, photoCount: 40, recentPhotos90d: 5,
    serviceItems: 8, hasMenu: true, reviewsLast30d: 10, daysSinceLastReply: 2,
};

describe('computeSeoScore', () => {
    it('ficha completa = 100 y sin misión', () => {
        const out = computeSeoScore(full);
        expect(out.score).toBe(100);
        expect(out.level).toBe('Top del barrio');
        expect(out.nextMission).toBeNull();
        expect(out.items.reduce((s, i) => s + i.max, 0)).toBe(100);
    });

    it('la próxima misión es la que más puntos suma', () => {
        const out = computeSeoScore({ ...full, photoCount: 5, website: false });
        expect(out.nextMission!.key).toBe('photo_count'); // faltan 6.4 pts vs 4 de la web
        expect(out.nextMission!.mission).toContain('fotos');
    });

    it('valores no medibles valen 0 y piden conectar Google', () => {
        const out = computeSeoScore({ ...full, estimated: true, responseRate: null, hasCover: null, recentPhotos90d: null });
        const rr = out.items.find((i) => i.key === 'response_rate')!;
        expect(rr.points).toBe(0);
        expect(rr.mission).toContain('Conecta tu Google Business');
        expect(out.estimated).toBe(true);
    });

    it('niveles y calificaciones bajas', () => {
        const out = computeSeoScore({ ...full, rating: 3.5, reviewCount: 0, responseRate: 0 });
        expect(out.items.find((i) => i.key === 'rating')!.points).toBe(0);
        expect(computeSeoScore({ ...full, rating: 4.0 }).items.find((i) => i.key === 'rating')!.points).toBe(5);
        const empty = computeSeoScore({
            estimated: true, name: false, address: false, phone: false, website: false, hours: false, primaryCategory: false,
            extraCategories: null, descriptionLength: null, rating: null, reviewCount: 0, responseRate: null, hasCover: null,
            hasLogo: null, photoCount: 0, recentPhotos90d: null, serviceItems: null, hasMenu: false, reviewsLast30d: null, daysSinceLastReply: null,
        });
        expect(empty.score).toBe(0);
        expect(empty.level).toBe('Por despegar');
    });
});
