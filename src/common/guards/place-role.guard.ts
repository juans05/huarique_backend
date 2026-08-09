import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_PLACE_ROLE_KEY } from '../decorators/requires-place-role.decorator';
import { PlaceTeamService, } from '../../modules/team/place-team.service';
import { PlaceTeamRole } from '../../modules/team/entities/place-team-member.entity';

export const ROLE_RANK: Record<PlaceTeamRole, number> = { agente: 1, supervisor: 2, admin: 3 };

@Injectable()
export class PlaceRoleGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private teamService: PlaceTeamService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredRole = this.reflector.getAllAndOverride<PlaceTeamRole>(REQUIRES_PLACE_ROLE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredRole) return true;

        const request = context.switchToHttp().getRequest();
        const placeId = request.params.placeId;
        const userId = request.user.id;

        const member = await this.teamService.getMembership(userId, placeId);
        if (!member) {
            throw new ForbiddenException('No tenés acceso a esta sede');
        }
        if (ROLE_RANK[member.role] < ROLE_RANK[requiredRole]) {
            throw new ForbiddenException('No tenés el rol necesario para esta acción');
        }

        request.placeTeamMember = member;
        request.accessibleWhatsappNumberIds = await this.teamService.getAccessibleWhatsappNumberIds(member);
        return true;
    }
}
