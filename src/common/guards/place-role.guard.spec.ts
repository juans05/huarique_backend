import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlaceRoleGuard } from './place-role.guard';
import { PlaceTeamService } from '../../modules/team/place-team.service';

function mockContext(params: any, user: any) {
    const request: any = { params, user };
    return {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
    } as unknown as ExecutionContext;
}

describe('PlaceRoleGuard', () => {
    let guard: PlaceRoleGuard;
    let teamService: { getMembership: jest.Mock; getAccessibleWhatsappNumberIds: jest.Mock };
    let reflector: Reflector;

    beforeEach(() => {
        teamService = {
            getMembership: jest.fn(),
            getAccessibleWhatsappNumberIds: jest.fn().mockResolvedValue('all'),
        };
        reflector = new Reflector();
        guard = new PlaceRoleGuard(reflector, teamService as unknown as PlaceTeamService);
    });

    it('allows an admin through a route requiring agente (jerarquía)', async () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('agente');
        teamService.getMembership.mockResolvedValue({ id: 'm1', role: 'admin' });

        const ctx = mockContext({ placeId: 'p1' }, { id: 'u1' });
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('rejects an agente on a route requiring admin', async () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('admin');
        teamService.getMembership.mockResolvedValue({ id: 'm1', role: 'agente' });

        const ctx = mockContext({ placeId: 'p1' }, { id: 'u1' });
        await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a user with no membership at all', async () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('agente');
        teamService.getMembership.mockResolvedValue(null);

        const ctx = mockContext({ placeId: 'p1' }, { id: 'u1' });
        await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('passes through when the route has no @RequiresPlaceRole', async () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

        const ctx = mockContext({ placeId: 'p1' }, { id: 'u1' });
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
        expect(teamService.getMembership).not.toHaveBeenCalled();
    });
});
