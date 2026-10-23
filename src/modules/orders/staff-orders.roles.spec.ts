import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlaceRoleGuard } from '../../common/guards/place-role.guard';
import { StaffOrdersController } from './staff-orders.controller';

const ctxFor = (handler: Function, placeId = 'p1') => ({
    getHandler: () => handler,
    getClass: () => StaffOrdersController,
    switchToHttp: () => ({ getRequest: () => ({ params: { placeId }, user: { id: 'u1' } }) }),
}) as any;

const guardWith = (role: string | null) => new PlaceRoleGuard(new Reflector(), {
    getMembership: async () => (role ? { id: 'm1', role } : null),
    getAccessibleWhatsappNumberIds: async () => [],
} as any);

describe('StaffOrdersController roles', () => {
    const proto = StaffOrdersController.prototype;

    it('cocina puede ver la KDS y cambiar estados', async () => {
        await expect(guardWith('cocina').canActivate(ctxFor(proto.kds))).resolves.toBe(true);
        await expect(guardWith('cocina').canActivate(ctxFor(proto.changeStatus))).resolves.toBe(true);
    });

    it('cocina no puede marcar pagado ni tocar configuración', async () => {
        await expect(guardWith('cocina').canActivate(ctxFor(proto.manualPayment))).rejects.toBeInstanceOf(ForbiddenException);
        await expect(guardWith('cocina').canActivate(ctxFor(proto.updateSettings))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('caja (agente) marca pagado pero no configura', async () => {
        await expect(guardWith('agente').canActivate(ctxFor(proto.manualPayment))).resolves.toBe(true);
        await expect(guardWith('agente').canActivate(ctxFor(proto.updateSettings))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('mozo ve mesas, abre la cuenta por QR, cobra y cierra; no ve pedidos de WhatsApp ni configura', async () => {
        for (const h of [proto.tablesBoard, proto.staffTable, proto.manualPayment, proto.closeTab]) {
            await expect(guardWith('mozo').canActivate(ctxFor(h))).resolves.toBe(true);
        }
        for (const h of [proto.list, proto.updateSettings, proto.tables]) {
            await expect(guardWith('mozo').canActivate(ctxFor(h))).rejects.toBeInstanceOf(ForbiddenException);
        }
        await expect(guardWith('cocina').canActivate(ctxFor(proto.staffTable))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('usuario de otra sede: 403', async () => {
        await expect(guardWith(null).canActivate(ctxFor(proto.kds))).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('StaffOrdersController.manualPayment', () => {
    it('mozo cobra la cuenta de mesa pero no marca pagado un pedido suelto', async () => {
        const payments = { recordManualPayment: jest.fn(async () => ({ status: 'PAGADO' })) };
        const ctrl = new StaffOrdersController({} as any, {} as any, payments as any, {} as any, {} as any);
        const req = { placeTeamMember: { role: 'mozo' } };
        await expect(ctrl.manualPayment('p1', { tabId: 't1', method: 'EFECTIVO' } as any, { id: 'u1' }, req)).resolves.toMatchObject({ status: 'PAGADO' });
        expect(() => ctrl.manualPayment('p1', { orderId: 'o1', method: 'EFECTIVO' } as any, { id: 'u1' }, req)).toThrow(ForbiddenException);
    });
});

describe('StaffOrdersController.list', () => {
    it('page no numérico se toma como 1', () => {
        const orders = { listForPlace: jest.fn() };
        new StaffOrdersController(orders as any, {} as any, {} as any, {} as any, {} as any).list('p1', undefined, undefined, undefined, 'abc');
        expect(orders.listForPlace).toHaveBeenCalledWith('p1', expect.objectContaining({ page: 1 }));
    });
});
