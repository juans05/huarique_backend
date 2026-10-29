import { SubscriptionsService } from './subscriptions.service';

describe('Planes por rubro (Wawa y Al Toque solo para el independiente)', () => {
    const config = { get: () => undefined } as any;
    const placesRepo = (place: any) => ({ findOne: async () => place }) as any;
    const withPlace = (place: any) =>
        new SubscriptionsService(null as any, null as any, placesRepo(place), null as any, config, null as any, null as any);
    const freelance = { businessType: 'barberia', metadata: { independent: true } };
    const barberia = { businessType: 'barberia', metadata: {} };

    it('al independiente le ofrece Wawa (S/69.90) y Al Toque (S/299.90)', async () => {
        const plans = await withPlace(freelance).getPlans('p');
        expect(plans.map((p) => p.tier)).toEqual(['wawa', 'al_toque']);
        expect(plans.map((p) => p.name)).toEqual(['Wawa', 'Al Toque']);
        expect(plans.map((p) => p.price)).toEqual([69.9, 299.9]);
    });

    it('a una barbería con equipo y a los demás rubros les ofrece Rankeado, Caserito y Taypá', async () => {
        const general = ['reputacion', 'fidelizacion', 'ia_total'];
        const plans = await withPlace(barberia).getPlans('p');
        expect(plans.map((p) => p.tier)).toEqual(general);
        expect(plans.map((p) => p.name)).toEqual(['Rankeado', 'Caserito', 'Taypá']);
        expect(plans.map((p) => p.price)).toEqual([254.9, 439.9, 749.9]);
        expect((await withPlace({ businessType: 'restaurante', metadata: { independent: true } }).getPlans('p')).map((p) => p.tier)).toEqual(general);
        expect((await withPlace(null).getPlans()).map((p) => p.tier)).toEqual(general);
    });

    it('no deja cambiar el local si el plan vigente no aplica al local cambiado', async () => {
        const repo = (tier: string | null) => ({ findOne: async () => (tier ? { tier } : null) }) as any;
        const withPlan = (tier: string | null) =>
            new SubscriptionsService(repo(tier), null as any, null as any, null as any, config, null as any, null as any);
        await expect(withPlan('al_toque').assertPlanAllowsPlace('p', { ...freelance, businessType: 'restaurante' })).rejects.toThrow();
        await expect(withPlan('ia_total').assertPlanAllowsPlace('p', freelance)).rejects.toThrow();
        await expect(withPlan('al_toque').assertPlanAllowsPlace('p', freelance)).resolves.toBeUndefined();
        await expect(withPlan(null).assertPlanAllowsPlace('p', barberia)).resolves.toBeUndefined();
    });

    it('Al Toque abre lo básico, WhatsApp, campañas, reportes y base de IA, pero no el resto de Taypá', () => {
        const service = withPlace(null);
        expect(service.hasTierAccess('al_toque', 'reputacion')).toBe(true);
        for (const f of ['whatsapp', 'campanas', 'reportes', 'ia'] as const) {
            expect(service.hasTierAccess('al_toque', 'ia_total', f)).toBe(true);
        }
        expect(service.hasTierAccess('al_toque', 'ia_total')).toBe(false);
        expect(service.hasTierAccess('al_toque', 'fidelizacion')).toBe(false);
        expect(service.hasTierAccess('ia_total', 'ia_total', 'whatsapp')).toBe(true);
        expect(service.hasTierAccess('reputacion', 'ia_total', 'whatsapp')).toBe(false);
    });

    it('Wawa abre WhatsApp, base de IA y reportes, pero no campañas', () => {
        const service = withPlace(null);
        expect(service.hasTierAccess('wawa', 'reputacion')).toBe(true);
        for (const f of ['whatsapp', 'ia', 'reportes'] as const) {
            expect(service.hasTierAccess('wawa', 'ia_total', f)).toBe(true);
        }
        expect(service.hasTierAccess('wawa', 'ia_total', 'campanas')).toBe(false);
        expect(service.hasTierAccess('wawa', 'fidelizacion')).toBe(false);
    });
});
