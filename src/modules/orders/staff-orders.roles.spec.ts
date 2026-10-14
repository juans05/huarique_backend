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

    it('usuario de otra sede: 403', async () => {
        await expect(guardWith(null).canActivate(ctxFor(proto.kds))).rejects.toBeInstanceOf(ForbiddenException);
    });
});
