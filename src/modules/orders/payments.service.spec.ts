import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

// Compara filas con un `where` de TypeORM: `Not(IsNull())` = "no nulo"; `In([...])` / FindOperator con `_value`.
const matches = (row: any, where: any = {}) => Object.entries(where).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && v._type === 'not') return row[k] !== null && row[k] !== undefined;
    if (v && typeof v === 'object' && '_value' in v) return Array.isArray(v._value) ? v._value.includes(row[k]) : row[k] === v._value;
    return row[k] === v;
});
const memRepo = (rows: any[] = []) => ({
    rows,
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
    find: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where))),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => { if (!x.id) x.id = `pay-${rows.length + 1}`; const i = rows.findIndex((r) => r.id === x.id); if (i >= 0) rows[i] = { ...rows[i], ...x }; else rows.push(x); return x; }),
    update: jest.fn(async (where: any, patch: any) => { const hits = rows.filter((r) => matches(r, where)); hits.forEach((r) => Object.assign(r, patch)); return { affected: hits.length }; }),
});

const fetchMock = (responses: Record<string, any>) => {
    global.fetch = jest.fn(async (url: string, init: any) => {
        const key = Object.keys(responses).find((k) => url.includes(k))!;
        return { ok: true, json: async () => responses[key], init } as any;
    }) as any;
};

const build = (settingsOverride: any = {}) => {
    const order = { id: 'o1', placeId: 'p1', number: 7, status: 'PENDIENTE_PAGO', total: 4500, tabId: null, publicToken: 'otok', customerPhone: '51999' };
    const orders = memRepo([order]);
    const tabs = memRepo([{ id: 'tab1', placeId: 'p1', publicToken: 'ttok', status: 'CUENTA_PEDIDA' }]);
    const payments = memRepo();
    const settings = { placeId: 'p1', paymentDestination: 'WUARIKES', culqiPublicKey: null, culqiSecretKey: null, cashPaymentEnabled: true, ...settingsOverride };
    const ordersService = {
        getSettings: jest.fn(async () => settings),
        markOrderPaid: jest.fn(async (id: string) => { const o = orders.rows.find((r) => r.id === id); if (o.status !== 'PENDIENTE_PAGO') return null; o.status = 'NUEVO'; return o; }),
        refreshTabAfterPayment: jest.fn(async () => undefined),
        tabTotal: jest.fn(async () => ({ total: 9000, paid: 2000, due: 7000 })),
        cancelUnpaid: jest.fn(async () => undefined),
    };
    const events = { publish: jest.fn(async () => undefined) };
    const emitter = { emit: jest.fn() };
    const config = { get: (k: string) => ({ CULQI_SECRET_KEY: 'sk_wuarikes', CULQI_PUBLIC_KEY: 'pk_wuarikes' } as any)[k] };
    const svc = new PaymentsService(payments as any, orders as any, tabs as any, ordersService as any, events as any, emitter as any, config as any);
    return { svc, payments, ordersService, emitter, orders };
};

describe('PaymentsService', () => {
    it('cuenta: cobra solo el saldo pendiente calculado en el backend', async () => {
        const { svc } = build();
        fetchMock({ '/orders': { id: 'ord_1' } });
        const intent = await svc.startOnlinePayment({ tabToken: 'ttok' }, { email: 'a@b.com' });
        expect(intent).toMatchObject({ amount: 7000, publicKey: 'pk_wuarikes', culqiOrderId: 'ord_1' });
    });

    it('cobro al local usa sus llaves', async () => {
        const { svc } = build({ paymentDestination: 'LOCAL', culqiPublicKey: 'pk_local', culqiSecretKey: 'sk_local' });
        fetchMock({ '/orders': { id: 'ord_2' } });
        const intent = await svc.startOnlinePayment({ orderToken: 'otok' }, { email: 'a@b.com' });
        expect(intent.publicKey).toBe('pk_local');
        expect((global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization).toBe('Bearer sk_local');
    });

    it('token de tarjeta: cobra, marca pagado una sola vez y emite el evento', async () => {
        const { svc, ordersService, emitter } = build();
        fetchMock({ '/orders': { id: 'ord_3' }, '/charges': { id: 'chr_1', outcome: { type: 'venta_exitosa' }, total_fee: 150 } });
        const { paymentId } = await svc.startOnlinePayment({ orderToken: 'otok' }, { email: 'a@b.com' });
        await svc.payWithToken(paymentId, 'tkn_test_1');
        await expect(svc.payWithToken(paymentId, 'tkn_test_1')).rejects.toBeInstanceOf(BadRequestException);
        expect(ordersService.markOrderPaid).toHaveBeenCalledTimes(1);
        expect(emitter.emit).toHaveBeenCalledWith('orders.payment.confirmed', { paymentId, placeId: 'p1', orderIds: ['o1'] });
    });

    it('3DS (REVIEW) no confirma', async () => {
        const { svc, ordersService, payments } = build();
        fetchMock({ '/orders': { id: 'ord_4' }, '/charges': { action_code: 'REVIEW' } });
        const { paymentId } = await svc.startOnlinePayment({ orderToken: 'otok' }, { email: 'a@b.com' });
        await expect(svc.payWithToken(paymentId, 'tkn')).rejects.toBeInstanceOf(BadRequestException);
        expect(ordersService.markOrderPaid).not.toHaveBeenCalled();
        expect(payments.rows[0].status).toBe('PENDIENTE');
    });

    it('webhook y revisión a la vez: el pago se confirma una sola vez', async () => {
        const { svc, ordersService, payments } = build();
        payments.rows.push({ id: 'pay-x', placeId: 'p1', orderId: 'o1', tabId: null, status: 'PENDIENTE', method: 'ONLINE', amount: 4500, culqiOrderId: 'ord_9', destination: 'WUARIKES', expiresAt: new Date(Date.now() + 3600_000) });
        fetchMock({ '/orders/ord_9': { id: 'ord_9', state: 'paid' } });
        await Promise.all([svc.reconcilePending('p1'), svc.reconcilePending()]);
        expect(ordersService.markOrderPaid).toHaveBeenCalledTimes(1);
        expect(payments.rows[0]).toMatchObject({ status: 'PAGADO', method: 'PAGOEFECTIVO' });
    });

    it('orden vencida: pago EXPIRADO y pedido cancelado con el mensaje', async () => {
        const { svc, ordersService, payments } = build();
        payments.rows.push({ id: 'pay-y', placeId: 'p1', orderId: 'o1', tabId: null, status: 'PENDIENTE', method: 'ONLINE', amount: 4500, culqiOrderId: 'ord_8', destination: 'WUARIKES', expiresAt: new Date(Date.now() - 1000) });
        fetchMock({ '/orders/ord_8': { id: 'ord_8', state: 'pending' } });
        await svc.reconcilePending();
        expect(payments.rows[0].status).toBe('EXPIRADO');
        expect(ordersService.cancelUnpaid).toHaveBeenCalledWith('o1', 'El código de pago venció');
    });

    it('efectivo en cuenta: registra el saldo con el usuario y destino LOCAL', async () => {
        const { svc, ordersService } = build();
        const payment = await svc.recordManualPayment('p1', { tabId: 'tab1' }, 'EFECTIVO', 'u1');
        expect(payment).toMatchObject({ amount: 7000, status: 'PAGADO', destination: 'LOCAL', recordedByUserId: 'u1' });
        expect(ordersService.refreshTabAfterPayment).toHaveBeenCalledWith('tab1');
    });

    const chargeCalls = () => (global.fetch as jest.Mock).mock.calls.filter(([url]) => url.includes('/charges')).length;

    it('dos payWithToken a la vez: un solo cobro en Culqi', async () => {
        const { svc, ordersService } = build();
        fetchMock({ '/orders': { id: 'ord_5' }, '/charges': { id: 'chr_5', outcome: { type: 'venta_exitosa' } } });
        const { paymentId } = await svc.startOnlinePayment({ orderToken: 'otok' }, { email: 'a@b.com' });
        const results = await Promise.allSettled([svc.payWithToken(paymentId, 'tkn_a'), svc.payWithToken(paymentId, 'tkn_b')]);
        expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
        expect(chargeCalls()).toBe(1);
        expect(ordersService.markOrderPaid).toHaveBeenCalledTimes(1);
    });

    it('pedido cancelado con el checkout abierto: no se cobra', async () => {
        const { svc, orders, payments } = build();
        fetchMock({ '/orders': { id: 'ord_6' }, '/charges': { id: 'chr_6', outcome: { type: 'venta_exitosa' } } });
        const { paymentId } = await svc.startOnlinePayment({ orderToken: 'otok' }, { email: 'a@b.com' });
        orders.rows[0].status = 'CANCELADO';
        await expect(svc.payWithToken(paymentId, 'tkn')).rejects.toThrow('Este pago ya no está pendiente');
        expect(chargeCalls()).toBe(0);
        expect(payments.rows[0].status).toBe('EXPIRADO');
    });

    it('cuenta ya pagada por otro medio: no se cobra', async () => {
        const { svc, ordersService } = build();
        fetchMock({ '/orders': { id: 'ord_7' }, '/charges': { id: 'chr_7', outcome: { type: 'venta_exitosa' } } });
        const { paymentId } = await svc.startOnlinePayment({ tabToken: 'ttok' }, { email: 'a@b.com' });
        ordersService.tabTotal.mockResolvedValue({ total: 9000, paid: 9000, due: 0 });
        await expect(svc.payWithToken(paymentId, 'tkn')).rejects.toThrow('Este pago ya no está pendiente');
        expect(chargeCalls()).toBe(0);
    });

    it('CIP pagado después de pagar con tarjeta: devolución pendiente y sin evento de pago', async () => {
        const { svc, orders, payments, emitter } = build();
        orders.rows[0].status = 'NUEVO'; // ya se pagó con tarjeta en otro intento
        payments.rows.push({ id: 'pay-cip', placeId: 'p1', orderId: 'o1', tabId: null, status: 'PENDIENTE', method: 'ONLINE', amount: 4500, culqiOrderId: 'ord_cip', destination: 'WUARIKES', expiresAt: new Date(Date.now() + 3600_000) });
        fetchMock({ '/orders/ord_cip': { id: 'ord_cip', state: 'paid' } });
        await svc.reconcilePending('p1');
        expect(payments.rows[0].status).toBe('PAGADO');
        expect(orders.rows[0].refundPending).toBe(true);
        expect(emitter.emit).not.toHaveBeenCalledWith('orders.payment.confirmed', expect.anything());
    });

    it('conciliación reintenta pedidos con pago PAGADO que quedaron en PENDIENTE_PAGO', async () => {
        const { svc, payments, ordersService, emitter } = build();
        payments.rows.push({ id: 'pay-z', placeId: 'p1', orderId: 'o1', tabId: null, status: 'PAGADO', method: 'TARJETA', amount: 4500, culqiOrderId: null });
        await svc.reconcilePending();
        expect(ordersService.markOrderPaid).toHaveBeenCalledWith('o1');
        expect(emitter.emit).toHaveBeenCalledWith('orders.payment.confirmed', { paymentId: 'pay-z', placeId: 'p1', orderIds: ['o1'] });
    });

    it('pedido WhatsApp con más de 2 h sin pago: se cancela', async () => {
        const { svc, orders, ordersService } = build();
        Object.assign(orders.rows[0], { channel: 'WHATSAPP', createdAt: new Date(Date.now() - 3 * 3600_000) });
        await svc.reconcilePending();
        expect(ordersService.cancelUnpaid).toHaveBeenCalledWith('o1', 'No se completó el pago');
    });

    it('pedido WhatsApp reciente o con código PagoEfectivo vigente: no se cancela', async () => {
        const { svc, orders, payments, ordersService } = build();
        Object.assign(orders.rows[0], { channel: 'WHATSAPP', createdAt: new Date(Date.now() - 30 * 60_000) });
        await svc.reconcilePending();
        Object.assign(orders.rows[0], { createdAt: new Date(Date.now() - 3 * 3600_000) });
        payments.rows.push({ id: 'pay-cip', placeId: 'p1', orderId: 'o1', tabId: null, status: 'PENDIENTE', method: 'ONLINE', amount: 4500, culqiOrderId: 'ord_live', destination: 'WUARIKES', expiresAt: new Date(Date.now() + 3600_000) });
        fetchMock({ '/orders/ord_live': { id: 'ord_live', state: 'pending' } });
        await svc.reconcilePending();
        expect(ordersService.cancelUnpaid).not.toHaveBeenCalled();
    });
});
