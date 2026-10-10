import { SubscriptionsService } from './subscriptions.service';

const DAY = 24 * 3600 * 1000;

const originalFetch = global.fetch;
afterAll(() => {
    global.fetch = originalFetch;
});

const build = (sub: any, culqiResponses: Record<string, any>) => {
    const subscriptionsRepo = { find: jest.fn().mockResolvedValue([sub]), save: jest.fn(async (x) => x) };
    const paymentsRepo = { exists: jest.fn().mockResolvedValue(false), create: jest.fn((x) => x), save: jest.fn(async (x) => ({ id: 'pay-new', ...x })) };
    const config = { get: jest.fn((k: string) => (k === 'CULQI_SECRET_KEY' ? 'sk_test_x' : undefined)) };
    const events = { emit: jest.fn() };
    global.fetch = jest.fn(async (url: string) => {
        const key = Object.keys(culqiResponses).find((k) => url.includes(k));
        return { ok: true, json: async () => culqiResponses[key!] } as any;
    }) as any;
    const svc = new SubscriptionsService(subscriptionsRepo as any, paymentsRepo as any, {} as any, {} as any, config as any, events as any);
    return { svc, events, paymentsRepo };
};

describe('SubscriptionsService: eventos para comisiones', () => {
    it('renovación confirmada → guarda el pago y emite subscription.payment.recorded', async () => {
        const localEnd = new Date(Date.now() - 2 * DAY);
        const sub = { id: 's1', status: 'active', culqiSubscriptionId: 'sxn_1', currentPeriodEnd: localEnd, amount: 19900, currency: 'PEN', userId: 'u1' };
        const { svc, events } = build(sub, {
            '/recurrent/subscriptions/sxn_1': { status: 3, next_billing_date: Math.floor((Date.now() + 28 * DAY) / 1000), periods: { charges: { charge_id: 'chr_1' } } },
            '/charges/chr_1': { outcome: { type: 'venta_exitosa' }, amount: 19900, currency_code: 'PEN' },
        });
        await svc.syncAllWithCulqi();
        expect(events.emit).toHaveBeenCalledWith('subscription.payment.recorded', { subscriptionId: 's1', paymentId: 'pay-new' });
    });

    it('cancelada en Culqi → emite subscription.canceled', async () => {
        const sub = { id: 's1', status: 'active', culqiSubscriptionId: 'sxn_1', currentPeriodEnd: new Date(Date.now() + 10 * DAY), amount: 19900 };
        const { svc, events } = build(sub, { '/recurrent/subscriptions/sxn_1': { status: 4 } });
        await svc.syncAllWithCulqi();
        expect(events.emit).toHaveBeenCalledWith('subscription.canceled', expect.objectContaining({ subscriptionId: 's1', canceledAt: expect.any(Date) }));
    });
});
