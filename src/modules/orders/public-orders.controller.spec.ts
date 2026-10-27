import { BadRequestException } from '@nestjs/common';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { PublicOrdersController } from './public-orders.controller';

const build = () => {
    const orders = { createTableOrder: jest.fn(async () => ({ order: { publicToken: 'otok', total: 7850 }, tab: { publicToken: 'ttok' }, requiresPayment: true })) };
    const payments = { reconcilePending: jest.fn(async () => undefined) };
    const ctrl = new PublicOrdersController({} as any, {} as any, {} as any, orders as any, payments as any, {} as any, {} as any, {} as any);
    return { ctrl, payments };
};

describe('PublicOrdersController', () => {
    it('POST /public/orders devuelve el total calculado en el backend (céntimos)', async () => {
        const { ctrl } = build();
        await expect(ctrl.createOrder({ qrToken: 'qr', items: [] } as any, { ip: '200.48.1.10' })).resolves.toEqual({ orderToken: 'otok', tabToken: 'ttok', requiresPayment: true, total: 7850 });
    });

    it('POST /public/orders y el webhook tienen rate limit propio', () => {
        expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', PublicOrdersController.prototype.createOrder)).toBe(10);
        expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', PublicOrdersController.prototype.webhook)).toBe(20);
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
    const make = (businessType: string, opts: { pros?: number; number?: string | null; plan?: boolean; ordersEnabled?: boolean; status?: string }) => {
        const places = { findOne: jest.fn(async () => ({ id: 'p1', businessType, status: opts.status ?? 'active' })) };
        const orders = {
            getSettings: jest.fn(async () => ({ ordersEnabled: opts.ordersEnabled ?? true, pickupEnabled: true, deliveryEnabled: false })),
            hasPlan: jest.fn(async () => opts.plan ?? true),
        };
        const ds = { query: jest.fn(async (sql: string) => (sql.includes('place_professionals') ? [{ n: opts.pros ?? 0 }] : opts.number ? [{ phone_number: opts.number }] : [])) };
        return new PublicOrdersController({} as any, {} as any, places as any, orders as any, {} as any, {} as any, ds as any, { get: () => 'https://admin.test' } as any);
    };

    it('barbería con profesionales y plan: link de reservas; sin pedidos', async () => {
        await expect(make('barberia', { pros: 2, number: '+51 999 888 777' }).placeActions('p1'))
            .resolves.toEqual({ bookingUrl: 'https://admin.test/reservar/p1', orderWhatsapp: null });
    });

    it('restaurante con pedidos, WhatsApp y plan IA: número limpio; sin agenda', async () => {
        await expect(make('restaurante', { number: '+51 999 888 777' }).placeActions('p1')).resolves.toEqual({ bookingUrl: null, orderWhatsapp: '51999888777' });
    });

    it('sin plan, sin profesionales, sin WhatsApp o local no activo: nada', async () => {
        await expect(make('barberia', { pros: 2, plan: false }).placeActions('p1')).resolves.toEqual({ bookingUrl: null, orderWhatsapp: null });
        await expect(make('restaurante', { number: null }).placeActions('p1')).resolves.toEqual({ bookingUrl: null, orderWhatsapp: null });
        await expect(make('barberia', { pros: 0 }).placeActions('p1')).resolves.toEqual({ bookingUrl: null, orderWhatsapp: null });
        await expect(make('barberia', { pros: 2, status: 'pending' }).placeActions('p1')).resolves.toEqual({ bookingUrl: null, orderWhatsapp: null });
    });
});
