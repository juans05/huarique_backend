import { estimateCost, marketOf, parseStatuses, projectMonth, type Rate } from './whatsapp-pricing.util';

const RATES: Rate[] = [
    { market: 'PE', category: 'utility', currency: 'PEN', rate: 0.08, validFrom: '2026-07-01' },
    { market: 'PE', category: 'utility', currency: 'PEN', rate: 0.0998, validFrom: '2026-10-01' },
    { market: 'PE', category: 'marketing', currency: 'PEN', rate: 0.2339, validFrom: '2026-10-01' },
    { market: 'LATAM', category: 'utility', currency: 'PEN', rate: 0.0376, validFrom: '2026-10-01' },
    { market: 'OTHER', category: 'utility', currency: 'PEN', rate: 0.0256, validFrom: '2026-10-01' },
];

describe('marketOf', () => {
    it('Perú, resto de Latinoamérica (incluido el Caribe +1), Norteamérica, mercados propios y Other', () => {
        expect(marketOf('51987654321')).toBe('PE');
        expect(marketOf('+591 7123 4567')).toBe('LATAM');
        expect(marketOf('593991234567')).toBe('LATAM');
        expect(marketOf('18095551234')).toBe('LATAM');
        expect(marketOf('13055551234')).toBe('NA');
        expect(marketOf('5491112345678')).toBe('AR');
        expect(marketOf('8613800000000')).toBe('OTHER');
    });
});

describe('estimateCost', () => {
    const q = { market: 'PE', category: 'utility', currency: 'PEN', billable: true, day: '2026-10-15' };

    it('usa la tarifa vigente en la fecha de entrega', () => {
        expect(estimateCost(RATES, q)).toBe(0.0998);
        expect(estimateCost(RATES, { ...q, day: '2026-09-15' })).toBe(0.08);
    });

    it('no facturable = 0; sin tarifa para ese mercado o moneda = null', () => {
        expect(estimateCost(RATES, { ...q, billable: false })).toBe(0);
        expect(estimateCost(RATES, { ...q, market: 'LATAM' })).toBe(0.0376);
        expect(estimateCost(RATES, { ...q, market: 'OTHER' })).toBe(0.0256);
        expect(estimateCost(RATES, { ...q, market: 'NA' })).toBeNull();
        expect(estimateCost(RATES, { ...q, currency: 'USD' })).toBeNull();
        expect(estimateCost(RATES, { ...q, currency: null })).toBeNull();
    });
});

describe('parseStatuses', () => {
    it('lee pricing y códigos de error de los estados', () => {
        const payload = { entry: [{ changes: [{ value: { statuses: [
            { id: 'w1', status: 'delivered', recipient_id: '51987654321', timestamp: '1761400000', pricing: { billable: true, pricing_model: 'PMP', type: 'regular', category: 'utility' } },
            { id: 'w2', status: 'failed', recipient_id: '51987654321', timestamp: '1761400000', errors: [{ code: 131042, title: 'Business eligibility payment issue' }] },
            { id: 'w3', status: 'delivered', recipient_id: '51987654321', pricing: { billable: false, type: 'free_customer_service', category: 'service', subtype: 'paid_exempt' } },
        ] } }] }] };
        const [a, b, c] = parseStatuses(payload);
        expect(a).toEqual(expect.objectContaining({ wamid: 'w1', status: 'delivered', pricing: { billable: true, category: 'utility', type: 'regular', subtype: null }, errorCodes: [] }));
        expect(b.errorCodes).toEqual([131042]);
        expect(c.pricing).toEqual({ billable: false, category: 'service', type: 'free_customer_service', subtype: 'paid_exempt' });
    });

    it('ignora mensajes entrantes y payloads vacíos', () => {
        expect(parseStatuses({ entry: [{ changes: [{ value: { messages: [{ id: 'm1' }] } }] }] })).toEqual([]);
        expect(parseStatuses(null)).toEqual([]);
    });
});

describe('projectMonth', () => {
    it('promedio diario × días del mes', () => {
        expect(projectMonth(10, 10, 31)).toBe(31);
        expect(projectMonth(0, 0, 30)).toBe(0);
    });
});
