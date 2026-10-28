import { SubscriptionsService } from './subscriptions.service';

describe('Planes por rubro', () => {
    const config = { get: () => undefined } as any;
    const service = new SubscriptionsService(null as any, null as any, null as any, null as any, config, null as any, null as any);

    it('a una barbería solo le ofrece el plan Barbero, a S/250', () => {
        const plans = service.getPlans('barberia');
        expect(plans.map((p) => p.tier)).toEqual(['barbero']);
        expect(plans[0].price).toBe(250);
    });

    it('a los demás rubros les ofrece los planes generales', () => {
        expect(service.getPlans('restaurante').map((p) => p.tier)).toEqual(['reputacion', 'fidelizacion', 'ia_total']);
        expect(service.getPlans().map((p) => p.tier)).toEqual(['reputacion', 'fidelizacion', 'ia_total']);
    });

    it('el plan Barbero abre lo mismo que IA Total', () => {
        expect(service.hasTierAccess('barbero', 'reputacion')).toBe(true);
        expect(service.hasTierAccess('barbero', 'ia_total')).toBe(true);
        expect(service.hasTierAccess('reputacion', 'ia_total')).toBe(false);
    });
});
