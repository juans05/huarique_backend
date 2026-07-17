import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { EmailCampaignController } from './email-campaign.controller';
import { EmailCampaignService } from './email-campaign.service';
import { EmailCampaignProcessor } from './email-campaign.processor';
import { EmailCampaign } from './entities/email-campaign.entity';
import { Place } from '../places/entities/place.entity';
import { CommonModule } from '../../common/common.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([EmailCampaign, Place]),
        BullModule.registerQueue({
            name: 'email-broadcast',
        }),
        CommonModule,
        SubscriptionsModule,
    ],
    controllers: [EmailCampaignController],
    providers: [EmailCampaignService, EmailCampaignProcessor],
    exports: [EmailCampaignService, TypeOrmModule],
})
export class EmailCampaignModule {}
