import { BadRequestException } from '@nestjs/common';
import { CashService } from './cash.service';
import { Order } from './entities/order.entity';
import { Receipt } from './entities/receipt.entity';

const build = (opts: { sessionStatus?: string; saveFails?: boolean } = {}) => {
    const calls: string[] = [];
    const order = {
        id: 'o1', placeId: 'p1', number: 12, total: 5300, deliveryFee: 500,
        items: [{ dishId: 'd1', dishNameSnapshot: 'Lomo saltado', quantity: 2, unitPrice: 2400, lineTotal: 4800 }],
    };
    const em = {
        query: jest.fn(async (sql: string) => {
            if (sql.includes('FOR UPDATE')) { calls.push('lock'); return [{ status: opts.sessionStatus ?? 'ABIERTA' }]; }
            if (sql.includes('MAX(number)')) return [{ max: 41 }];
            return [];
        }),
        findOne: jest.fn(async (entity: any, { where }: any) => (entity === Order && where.id === order.id && where.placeId === 'p1' ? order : null)),
        create: jest.fn((_entity: any, x: any) => x),
        save: jest.fn(async (x: any) => { if (opts.saveFails) throw new Error('db caída'); return { id: 'r1', ...x }; }),
    };
    const dataSource = { transaction: jest.fn(async (fn: any) => { calls.push('tx'); return fn(em); }) };
    const sessions = { findOne: jest.fn(async () => ({ id: 's1', placeId: 'p1', status: 'ABIERTA' })) };
    const orders = { getSettings: jest.fn(async () => ({ receiptSeries: { TICKET: 'T001', BOLETA: 'B001', FACTURA: 'F001' } })), closeTab: jest.fn() };
    const announce = jest.fn(async () => { calls.push('announce'); });
    const payments = { recordManualPayment: jest.fn(async (_p: string, _t: any, _m: string, _u: string, tx: any) => {
        calls.push('pay'); tx.afterCommit(announce); return { id: 'pay-1', amount: 5300, status: 'PAGADO' };
    }) };
    const svc = new CashService(sessions as any, {} as any, {} as any, {} as any, {} as any, dataSource as any, orders as any, payments as any, {} as any, { emit: jest.fn() } as any);
    return { svc, em, payments, orders, calls, announce };
};

describe('CashService.chargeOrder', () => {
    it('cobra el pedido dentro del bloqueo de caja y emite el comprobante con el siguiente número de la serie', async () => {
        const { svc, em, payments, orders, calls } = build();
        const receipt = await svc.chargeOrder('p1', 'u1', 'o1', { docType: 'BOLETA', method: 'TARJETA' });
        expect(calls).toEqual(['tx', 'lock', 'pay', 'announce']);
        expect(payments.recordManualPayment).toHaveBeenCalledWith('p1', { orderId: 'o1' }, 'POS', 'u1', { em, afterCommit: expect.any(Function) });
        expect(em.create).toHaveBeenCalledWith(Receipt, expect.objectContaining({
            placeId: 'p1', cashSessionId: 's1', kind: 'VENTA', tabId: null, paymentId: 'pay-1', docType: 'BOLETA', series: 'B001', number: 42,
            paymentMethod: 'TARJETA', total: 5300, createdByUserId: 'u1', tableName: 'Pedido #12',
            items: [
                { dishId: 'd1', description: 'Lomo saltado', quantity: 2, unitPrice: 2400, lineTotal: 4800 },
                { dishId: null, description: 'Delivery', quantity: 1, unitPrice: 500, lineTotal: 500 },
            ],
        }));
        expect(receipt).toMatchObject({ code: 'B001-00000042' });
        expect(orders.closeTab).not.toHaveBeenCalled();
    });

    it('falla al guardar el comprobante: todo va en la transacción (se revierte) y no sale ningún aviso', async () => {
        const { svc, payments, announce } = build({ saveFails: true });
        await expect(svc.chargeOrder('p1', 'u1', 'o1', { docType: 'TICKET', method: 'EFECTIVO' })).rejects.toThrow('db caída');
        expect((payments.recordManualPayment.mock.calls[0] as any[])[4].em).toBeDefined();
        expect(announce).not.toHaveBeenCalled();
    });

    it('caja cerrada mientras tanto: no registra el pago', async () => {
        const { svc, payments } = build({ sessionStatus: 'CERRADA' });
        await expect(svc.chargeOrder('p1', 'u1', 'o1', { docType: 'TICKET', method: 'EFECTIVO' })).rejects.toBeInstanceOf(BadRequestException);
        expect(payments.recordManualPayment).not.toHaveBeenCalled();
    });

    it('pedido de otro local: 404 sin pago', async () => {
        const { svc, payments } = build();
        await expect(svc.chargeOrder('p1', 'u1', 'otro', { docType: 'TICKET', method: 'EFECTIVO' })).rejects.toThrow('Pedido no encontrado');
        expect(payments.recordManualPayment).not.toHaveBeenCalled();
    });

    it('factura sin RUC: no registra el pago', async () => {
        const { svc, payments } = build();
        await expect(svc.chargeOrder('p1', 'u1', 'o1', { docType: 'FACTURA', method: 'EFECTIVO' })).rejects.toBeInstanceOf(BadRequestException);
        expect(payments.recordManualPayment).not.toHaveBeenCalled();
    });
});
