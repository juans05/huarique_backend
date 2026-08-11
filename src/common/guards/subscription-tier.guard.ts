import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_TIER_KEY } from '../decorators/requires-tier.decorator';
import { SubscriptionsService, SubscriptionTier } from '../../modules/subscriptions/subscriptions.service';

const TIER_LABEL: Record<SubscriptionTier, string> = {
    reputacion: 'Wuarike Reputación',
    fidelizacion: 'Wuarike Fidelización+',
    ia_total: 'Wuarike IA Total',
};

// Las suscripciones son por sede — este guard queda solo para rutas sin concepto
// de sede (ej. PlazBot Setup: templates/campañas del workspace compartido), donde
// se gatea por "¿el usuario dueño de alguna sede con este plan?" en vez de una
// sede puntual. Cualquier ruta con :placeId debe usar PlaceTeamService.assertAccess.
@Injectable()
export class SubscriptionTierGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private subscriptionsService: SubscriptionsService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredTier = this.reflector.getAllAndOverride<SubscriptionTier>(REQUIRES_TIER_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredTier) return true;

        const { user } = context.switchToHttp().getRequest();
        const hasAccess = await this.subscriptionsService.hasAnyPlaceWithTier(user.id, requiredTier);

        if (!hasAccess) {
            throw new ForbiddenException(`Esta función requiere el plan ${TIER_LABEL[requiredTier]} o superior en alguna de tus sedes.`);
        }

        return true;
    }
}
