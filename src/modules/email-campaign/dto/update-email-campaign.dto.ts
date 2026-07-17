import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateEmailCampaignDto } from './create-email-campaign.dto';

export class UpdateEmailCampaignDto extends PartialType(
    OmitType(CreateEmailCampaignDto, ['placeId', 'scheduledAt'] as const),
) {}
