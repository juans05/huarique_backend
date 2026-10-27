import { mapInsights } from './meta-ads-insights.util';

describe('mapInsights', () => {
    it('totales, gasto por día, campañas ordenadas por gasto, costo por mensaje y tope de gasto', () => {
        const r = mapInsights({
            daily: [{ date_start: '2026-10-01', spend: '10.5' }, { date_start: '2026-10-02', spend: '4.25' }],
            campaigns: [
                { campaign_name: 'Corte', spend: '4.25', reach: '900', clicks: '30', cpc: '0.14', ctr: '1.2', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '5' }] },
                { campaign_name: 'Promo', spend: '10.5', reach: '2000', clicks: '50', cpc: '0.21', ctr: '1.5' },
            ],
            total: { spend: '14.75', reach: '2500', impressions: '8000', clicks: '80', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '5' }] },
            account: { currency: 'PEN', spend_cap: '50000', amount_spent: '12000' },
        });
        expect(r.currency).toBe('PEN');
        expect(r.totals).toEqual({ spend: 14.75, reach: 2500, impressions: 8000, clicks: 80, messages: 5, costPerMessage: 2.95 });
        expect(r.daily).toEqual([{ date: '2026-10-01', spend: 10.5 }, { date: '2026-10-02', spend: 4.25 }]);
        expect(r.campaigns.map((c) => c.name)).toEqual(['Promo', 'Corte']);
        expect(r.campaigns[0].messages).toBe(0);
        expect(r.spendCap).toEqual({ cap: 500, spent: 120 });
    });

    it('sin actions ni datos: ceros, sin costo por mensaje y sin tope', () => {
        const r = mapInsights({ daily: [], campaigns: [], total: undefined, account: {} });
        expect(r.totals).toEqual({ spend: 0, reach: 0, impressions: 0, clicks: 0, messages: 0, costPerMessage: null });
        expect(r.spendCap).toBeNull();
        expect(r.currency).toBeNull();
    });
});
