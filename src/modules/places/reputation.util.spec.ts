import {
    limaWeekStart, limaMonthStart, matchKeywords, shouldAlert, randomDelayMs,
    aiReplyLimit, templateReply, mergeReviewAutoSettings,
} from './reputation.util';

describe('reputation.util', () => {
    it('semana de Lima empieza el lunes 00:00 hora de Lima', () => {
        // Lunes 12/10/2026 03:00 UTC = domingo 11/10 22:00 en Lima → la semana empezó el lunes 05/10.
        expect(limaWeekStart(new Date('2026-10-12T03:00:00Z')).toISOString()).toBe('2026-10-05T05:00:00.000Z');
        // Miércoles 14/10 15:00 UTC → lunes 12/10 00:00 Lima = 05:00 UTC.
        expect(limaWeekStart(new Date('2026-10-14T15:00:00Z')).toISOString()).toBe('2026-10-12T05:00:00.000Z');
    });

    it('mes de Lima', () => {
        // 1/11 03:00 UTC todavía es 31/10 en Lima.
        expect(limaMonthStart(new Date('2026-11-01T03:00:00Z')).toISOString()).toBe('2026-10-01T05:00:00.000Z');
    });

    it('palabras clave sin tildes ni mayúsculas y por palabra completa', () => {
        expect(matchKeywords('La comida llegó FRÍA y demoró mucho', ['frio', 'fría', 'Demoró'])).toEqual(['fría', 'Demoró']);
        expect(matchKeywords('Ricos frijoles', ['frio'])).toEqual([]);
        expect(matchKeywords('mala atención del mozo', ['mala atencion'])).toEqual(['mala atencion']);
        expect(matchKeywords(undefined, ['x'])).toEqual([]);
    });

    it('alerta por calificación baja o palabra clave', () => {
        expect(shouldAlert(2, 'ok', {})).toEqual({ alert: true, matched: [] });
        expect(shouldAlert(3, 'ok', { lowRatingMax: 2 })).toEqual({ alert: false, matched: [] });
        expect(shouldAlert(5, 'Todo rico pero demoró', { keywords: ['demoro'] })).toEqual({ alert: true, matched: ['demoro'] });
        expect(shouldAlert(1, 'x', { alerts: false })).toEqual({ alert: false, matched: [] });
        expect(shouldAlert(0, 'x', {})).toEqual({ alert: false, matched: [] });
    });

    it('retardo aleatorio entre min y max', () => {
        expect(randomDelayMs(30, 180, () => 0)).toBe(30 * 60_000);
        expect(randomDelayMs(30, 180, () => 1)).toBe(180 * 60_000);
    });

    it('cupo de IA por plan', () => {
        expect(aiReplyLimit(null)).toBe(10);
        expect(aiReplyLimit('reputacion')).toBe(10);
        expect(aiReplyLimit('fidelizacion')).toBe(1000);
        expect(aiReplyLimit('ia_total')).toBe(1000);
    });

    it('plantillas solo para 4–5 estrellas y con el primer nombre', () => {
        expect(templateReply(2, 'Ana', 0)).toBeNull();
        expect(templateReply(5, 'Ana María Pérez', 0)).toContain('Ana');
        expect(templateReply(4, undefined, 7)).toBeTruthy();
    });

    it('fusiona y valida la configuración', () => {
        const now = new Date('2026-10-14T12:00:00Z');
        const merged = mergeReviewAutoSettings(
            { alerts: true, alertsSince: '2026-10-01T00:00:00.000Z', keywords: ['viejo'] },
            {
                lowRatingMax: 9,
                keywords: [' Frío ', 'frío', '', ...Array.from({ length: 30 }, (_, i) => `p${i}`)],
                alertEmail: 'no-es-correo',
                contactEmail: 'Hola@Local.pe',
                tone: 'raro' as any,
                language: 'cliente',
                goalRating: 4.66,
                autoReply: { enabled: true, stars: [5, 4, 4, 9], delayMin: 200, delayMax: 10 },
            } as any,
            now,
        );
        expect(merged.alertsSince).toBe('2026-10-01T00:00:00.000Z');
        expect(merged.lowRatingMax).toBe(3);
        expect(merged.keywords).toHaveLength(20);
        expect(merged.keywords![0]).toBe('Frío');
        expect(merged.alertEmail).toBeUndefined();
        expect(merged.contactEmail).toBe('hola@local.pe');
        expect(merged.tone).toBe('cercano');
        expect(merged.goalRating).toBe(4.7);
        expect(merged.autoReply).toEqual({ enabled: true, stars: [4, 5], delayMin: 10, delayMax: 200, since: now.toISOString() });
    });

    it('reactivar alertas o auto-respuesta reinicia su fecha de inicio', () => {
        const now = new Date('2026-10-14T12:00:00Z');
        const merged = mergeReviewAutoSettings(
            { alerts: false, alertsSince: '2026-01-01T00:00:00.000Z', autoReply: { enabled: false, stars: [4, 5], delayMin: 30, delayMax: 180, since: '2026-01-01T00:00:00.000Z' } },
            { alerts: true, autoReply: { enabled: true } as any },
            now,
        );
        expect(merged.alertsSince).toBe(now.toISOString());
        expect(merged.autoReply!.since).toBe(now.toISOString());
        expect(merged.autoReply!.stars).toEqual([4, 5]);
    });
});
