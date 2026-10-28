import { SubscriptionsService } from './subscriptions.service';

describe('Plan Barbero (solo barbero independiente)', () => {
    const config = { get: () => undefined } as any;
    const placesRepo = (place: any) => ({ findOne: async () => place }) as any;
    const withPlace = (place: any) =>
        new SubscriptionsService(null as any, null as any, placesRepo(place), null as any, config, null as any, null as any);
    const freelance = { businessType: 'barberia', metadata: { independent: true } };
    const barberia = { businessType: 'barberia', metadata: {} };

    it('al barbero independiente solo le ofrece el plan Barbero, a S/250', async () => {
        const plans = await withPlace(freelance).getPlans('p');
        expect(plans.map((p) => p.tier)).toEqual(['barbero']);
        expect(plans[0].price).toBe(250);
    });

    it('a una barbería con equipo y a los demás rubros les ofrece los planes generales', async () => {
        const general = ['reputacion', 'fidelizacion', 'ia_total'];
        expect((await withPlace(barberia).getPlans('p')).map((p) => p.tier)).toEqual(general);
        expect((await withPlace({ businessType: 'restaurante', metadata: { independent: true } }).getPlans('p')).map((p) => p.tier)).toEqual(general);
        expect((await withPlace(null).getPlans()).map((p) => p.tier)).toEqual(general);
    });

    it('no deja cambiar el local si el plan vigente no aplica al local cambiado', async () => {
        const repo = (tier: string | null) => ({ findOne: async () => (tier ? { tier } : null) }) as any;
        const withPlan = (tier: string | null) =>
            new SubscriptionsService(repo(tier), null as any, null as any, null as any, config, null as any, null as any);
        await expect(withPlan('barbero').assertPlanAllowsPlace('p', { ...freelance, businessType: 'restaurante' })).rejects.toThrow();
        await expect(withPlan('ia_total').assertPlanAllowsPlace('p', freelance)).rejects.toThrow();
        await expect(withPlan('barbero').assertPlanAllowsPlace('p', freelance)).resolves.toBeUndefined();
        await expect(withPlan(null).assertPlanAllowsPlace('p', barberia)).resolves.toBeUndefined();
    });

    it('abre lo básico y WhatsApp, pero no el resto de IA Total', () => {
        const service = withPlace(null);
        expect(service.hasTierAccess('barbero', 'reputacion')).toBe(true);
        expect(service.hasTierAccess('barbero', 'ia_total', 'whatsapp')).toBe(true);
        expect(service.hasTierAccess('barbero', 'ia_total')).toBe(false);
        expect(service.hasTierAccess('barbero', 'fidelizacion')).toBe(false);
        expect(service.hasTierAccess('ia_total', 'ia_total', 'whatsapp')).toBe(true);
        expect(service.hasTierAccess('reputacion', 'ia_total', 'whatsapp')).toBe(false);
    });
});
