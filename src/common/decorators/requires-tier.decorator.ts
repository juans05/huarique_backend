import { SetMetadata } from '@nestjs/common';
import { SubscriptionTier } from '../../modules/subscriptions/subscriptions.service';

export const REQUIRES_TIER_KEY = 'requiresTier';
export const RequiresTier = (tier: SubscriptionTier) => SetMetadata(REQUIRES_TIER_KEY, tier);
