import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { EmailCampaignController } from './email-campaign.controller';
import { EmailCampaignService } from './email-campaign.service';
import { EmailCampaignProcessor } from './email-campaign.processor';
import { EmailCampaign } from './entities/email-campaign.entity';
import { CommonModule } from '../../common/common.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([EmailCampaign]),
        BullModule.registerQueue({
            name: 'email-broadcast',
        }),
        CommonModule,
    ],
    controllers: [EmailCampaignController],
    providers: [EmailCampaignService, EmailCampaignProcessor],
    exports: [EmailCampaignService, TypeOrmModule],
})
export class EmailCampaignModule {}
