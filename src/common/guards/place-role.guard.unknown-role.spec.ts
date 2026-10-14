import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlaceRoleGuard } from './place-role.guard';

const ctx = () => ({
    getHandler: () => () => undefined,
    getClass: () => class { },
    switchToHttp: () => ({ getRequest: () => ({ params: { placeId: 'p1' }, user: { id: 'u1' } }) }),
}) as any;

describe('PlaceRoleGuard con rol desconocido', () => {
    it('un rol que no existe no pasa ningún control', async () => {
        const reflector = { getAllAndOverride: () => 'agente' } as unknown as Reflector;
        const guard = new PlaceRoleGuard(reflector, { getMembership: async () => ({ id: 'm1', role: 'superadmin' }), getAccessibleWhatsappNumberIds: async () => [] } as any);
        await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(ForbiddenException);
    });
});
