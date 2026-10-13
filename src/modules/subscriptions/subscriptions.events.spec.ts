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
    const mail = { sendHardwareOrderNotice: jest.fn().mockResolvedValue(undefined) };
    global.fetch = jest.fn(async (url: string) => {
        const key = Object.keys(culqiResponses).find((k) => url.includes(k));
        return { ok: true, json: async () => culqiResponses[key!] } as any;
    }) as any;
    const svc = new SubscriptionsService(subscriptionsRepo as any, paymentsRepo as any, {} as any, {} as any, config as any, events as any, mail as any);
    return { svc, events, paymentsRepo, mail };
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

describe('SubscriptionsService: compra de hardware', () => {
    const shipping = { fullName: 'Ana', phone: '999', address: 'Av. 1', district: 'Lima' };

    it('cobra el precio del servidor × cantidad y avisa al equipo', async () => {
        const { svc, mail } = build({}, { '/charges': { id: 'chr_hw', outcome: { type: 'venta_exitosa' } } });
        const result = await svc.buyHardware('u1', 'a@b.com', 'tkn_1', 'placa-google', 2, shipping);
        const [, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(JSON.parse(init.body)).toMatchObject({ amount: 19800, currency_code: 'PEN', source_id: 'tkn_1' });
        expect(result).toMatchObject({ chargeId: 'chr_hw', amount: 198 });
        expect(mail.sendHardwareOrderNotice).toHaveBeenCalled();
    });

    it('si el banco pide 3DS (REVIEW) no confirma la compra', async () => {
        const { svc, mail } = build({}, { '/charges': { action_code: 'REVIEW' } });
        await expect(svc.buyHardware('u1', 'a@b.com', 'tkn_1', 'placa-google', 1, shipping)).rejects.toThrow();
        expect(mail.sendHardwareOrderNotice).not.toHaveBeenCalled();
    });
});
