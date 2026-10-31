import { BadRequestException } from '@nestjs/common';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { PublicOrdersController } from './public-orders.controller';

const build = () => {
    const orders = {
        createTableOrder: jest.fn(async () => ({ order: { publicToken: 'otok', total: 7850 }, tab: { publicToken: 'ttok' }, requiresPayment: true })),
        createWebOrder: jest.fn(async () => ({ orderToken: 'wtok', requiresPayment: false, total: 2200 })),
        listPublicTables: jest.fn(async () => [{ name: 'Mesa 1', qrToken: 'qr-1' }]),
    };
    const payments = { reconcilePending: jest.fn(async () => undefined) };
    const ctrl = new PublicOrdersController({} as any, {} as any, {} as any, orders as any, payments as any, {} as any, {} as any, {} as any);
    return { ctrl, payments, orders };
};

describe('PublicOrdersController', () => {
    it('POST /public/orders devuelve el total calculado en el backend (céntimos)', async () => {
        const { ctrl } = build();
        await expect(ctrl.createOrder({ qrToken: 'qr', items: [] } as any, { ip: '200.48.1.10' })).resolves.toEqual({ orderToken: 'otok', tabToken: 'ttok', requiresPayment: true, total: 7850 });
    });

    it('POST /public/orders, el pedido web y el webhook tienen rate limit propio', () => {
        expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', PublicOrdersController.prototype.createOrder)).toBe(30);
        expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', PublicOrdersController.prototype.createWebOrder)).toBe(5);
        expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', PublicOrdersController.prototype.webhook)).toBe(20);
    });

    it('POST /public/places/:placeId/orders crea el pedido web del local y devuelve su resultado', async () => {
        const { ctrl, orders } = build();
        const dto = { fulfillment: 'RECOJO', items: [], customerName: 'Ana', customerPhone: '987654321', payOnDelivery: true };
        await expect(ctrl.createWebOrder('p1', dto as any)).resolves.toEqual({ orderToken: 'wtok', requiresPayment: false, total: 2200 });
        expect(orders.createWebOrder).toHaveBeenCalledWith('p1', dto);
    });

    it('GET /public/places/:placeId/tables lista las mesas públicas del local', async () => {
        const { ctrl, orders } = build();
        await expect(ctrl.placeTables('p1')).resolves.toEqual([{ name: 'Mesa 1', qrToken: 'qr-1' }]);
        expect(orders.listPublicTables).toHaveBeenCalledWith('p1');
    });

    it('webhook sin place: 400', () => {
        const { ctrl } = build();
        expect(() => ctrl.webhook(undefined)).toThrow(BadRequestException);
    });

    it('webhook: enfriamiento de 30 s por local antes de volver a conciliar', () => {
        const { ctrl, payments } = build();
        ctrl.webhook('p1');
        ctrl.webhook('p1');
        ctrl.webhook('p2');
        expect(payments.reconcilePending.mock.calls).toEqual([['p1'], ['p2']]);
    });
});

describe('PublicOrdersController.placeActions', () => {
    const make = (businessType: string, opts: { pros?: number; number?: string | null; plan?: boolean; ordersEnabled?: boolean; status?: string; tables?: number; settings?: Record<string, unknown> }) => {
        const places = { findOne: jest.fn(async () => ({ id: 'p1', businessType, status: opts.status ?? 'active' })) };
        const orders = {
            getSettings: jest.fn(async () => ({
                ordersEnabled: opts.ordersEnabled ?? true, pickupEnabled: true, deliveryEnabled: false, deliveryFee: 500, deliveryNote: null,
                paymentDestination: 'LOCAL', culqiPublicKey: null, culqiSecretKey: null, cashPaymentEnabled: true, webPaymentMode: 'ONLINE', ...opts.settings,
            })),
            hasPlan: jest.fn(async () => opts.plan ?? true),
        };
        const tables = { count: jest.fn(async () => opts.tables ?? 0) };
        const ds = { query: jest.fn(async (sql: string) => (sql.includes('place_professionals') ? [{ n: opts.pros ?? 0 }] : opts.number ? [{ phone_number: opts.number }] : [])) };
        return new PublicOrdersController(tables as any, {} as any, places as any, orders as any, {} as any, {} as any, ds as any, { get: () => 'https://admin.test' } as any);
    };
    const culqi = { culqiPublicKey: 'pk', culqiSecretKey: 'sk' };

    it('barbería con profesionales y plan: link de reservas; sin pedidos', async () => {
        await expect(make('barberia', { pros: 2, number: '+51 999 888 777' }).placeActions('p1'))
            .resolves.toEqual({ bookingUrl: 'https://admin.test/reservar/p1', orderWhatsapp: null, webOrdering: null });
    });

    it('restaurante con pedidos, WhatsApp y plan IA: número limpio; sin agenda', async () => {
        await expect(make('restaurante', { number: '+51 999 888 777' }).placeActions('p1')).resolves.toMatchObject({ bookingUrl: null, orderWhatsapp: '51999888777' });
    });

    it('sin plan, sin profesionales, sin WhatsApp o local no activo: nada', async () => {
        await expect(make('barberia', { pros: 2, plan: false }).placeActions('p1')).resolves.toEqual({ bookingUrl: null, orderWhatsapp: null, webOrdering: null });
        await expect(make('restaurante', { number: null }).placeActions('p1')).resolves.toMatchObject({ bookingUrl: null, orderWhatsapp: null });
        await expect(make('barberia', { pros: 0 }).placeActions('p1')).resolves.toEqual({ bookingUrl: null, orderWhatsapp: null, webOrdering: null });
        await expect(make('barberia', { pros: 2, status: 'pending' }).placeActions('p1')).resolves.toEqual({ bookingUrl: null, orderWhatsapp: null, webOrdering: null });
    });

    describe('webOrdering (pedir desde la carta pública)', () => {
        it('con Culqi y modo ONLINE: solo pago en línea; recojo y delivery según el local, tarifa y nota', async () => {
            const ctrl = make('restaurante', { tables: 3, settings: { ...culqi, deliveryEnabled: true, deliveryFee: 800, deliveryNote: 'Solo Miraflores' } });
            await expect(ctrl.placeActions('p1')).resolves.toEqual({
                bookingUrl: null, orderWhatsapp: null,
                webOrdering: { dineIn: true, pickup: true, delivery: true, deliveryFee: 800, deliveryNote: 'Solo Miraflores', payOnline: true, payOnDelivery: false },
            });
        });

        it('con Culqi y ONLINE_O_ENTREGA: ofrece las dos formas de pago', async () => {
            const { webOrdering } = await make('restaurante', { settings: { ...culqi, webPaymentMode: 'ONLINE_O_ENTREGA' } }).placeActions('p1') as any;
            expect(webOrdering).toMatchObject({ payOnline: true, payOnDelivery: true });
        });

        it('sin Culqi y con efectivo: solo pago al recibir; recojo según pickupEnabled', async () => {
            const on = await make('restaurante', {}).placeActions('p1') as any;
            expect(on.webOrdering).toMatchObject({ payOnline: false, payOnDelivery: true, pickup: true, delivery: false });
            const off = await make('restaurante', { settings: { pickupEnabled: false } }).placeActions('p1') as any;
            expect(off.webOrdering).toMatchObject({ payOnline: false, payOnDelivery: true, pickup: false });
        });

        it('sin Culqi y sin efectivo no hay forma de pagar: ni recojo ni delivery', async () => {
            const { webOrdering } = await make('restaurante', { settings: { cashPaymentEnabled: false, deliveryEnabled: true } }).placeActions('p1') as any;
            expect(webOrdering).toMatchObject({ payOnline: false, payOnDelivery: false });
            expect(webOrdering.pickup === false && webOrdering.delivery === false).toBe(true);
        });

        it('comer aquí solo si el local tiene mesas activas', async () => {
            const none = await make('restaurante', { tables: 0, settings: culqi }).placeActions('p1') as any;
            const some = await make('restaurante', { tables: 1, settings: culqi }).placeActions('p1') as any;
            expect([none.webOrdering.dineIn, some.webOrdering.dineIn]).toEqual([false, true]);
        });

        it('sin plan, con pedidos apagados o en un rubro sin pedidos: null; el número de WhatsApp no importa', async () => {
            await expect(make('restaurante', { plan: false, settings: culqi }).placeActions('p1')).resolves.toMatchObject({ webOrdering: null });
            await expect(make('restaurante', { ordersEnabled: false, settings: culqi }).placeActions('p1')).resolves.toMatchObject({ webOrdering: null });
            await expect(make('bodega', { settings: culqi }).placeActions('p1')).resolves.toMatchObject({ webOrdering: null });
            await expect(make('restaurante', { number: null, settings: culqi }).placeActions('p1')).resolves.toMatchObject({ webOrdering: expect.any(Object) });
        });
    });
});
