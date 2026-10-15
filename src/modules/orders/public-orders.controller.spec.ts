import { BadRequestException } from '@nestjs/common';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { PublicOrdersController } from './public-orders.controller';

const build = () => {
    const orders = { createTableOrder: jest.fn(async () => ({ order: { publicToken: 'otok', total: 7850 }, tab: { publicToken: 'ttok' }, requiresPayment: true })) };
    const payments = { reconcilePending: jest.fn(async () => undefined) };
    const ctrl = new PublicOrdersController({} as any, {} as any, {} as any, orders as any, payments as any, {} as any);
    return { ctrl, payments };
};

describe('PublicOrdersController', () => {
    it('POST /public/orders devuelve el total calculado en el backend (céntimos)', async () => {
        const { ctrl } = build();
        await expect(ctrl.createOrder({ qrToken: 'qr', items: [] } as any, { headers: { 'x-forwarded-for': '1.1.1.1, 200.48.1.10' } })).resolves.toEqual({ orderToken: 'otok', tabToken: 'ttok', requiresPayment: true, total: 7850 });
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
