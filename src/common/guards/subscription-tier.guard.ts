import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_TIER_KEY } from '../decorators/requires-tier.decorator';
import { SubscriptionsService, SubscriptionTier } from '../../modules/subscriptions/subscriptions.service';

const TIER_LABEL: Record<SubscriptionTier, string> = {
    reputacion: 'Wuarike Reputación',
    fidelizacion: 'Wuarike Fidelización+',
    ia_total: 'Wuarike IA Total',
};

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
        const subscription = await this.subscriptionsService.getMySubscription(user.id);

        if (!subscription || subscription.status !== 'active') {
            throw new ForbiddenException('Necesitas una suscripción activa para usar esta función.');
        }

        if (!this.subscriptionsService.hasTierAccess(subscription.tier, requiredTier)) {
            throw new ForbiddenException(`Esta función requiere el plan ${TIER_LABEL[requiredTier]} o superior.`);
        }

        return true;
    }
}
