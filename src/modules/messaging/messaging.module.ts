import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { Place } from '../places/entities/place.entity';
import { PlazBotModule } from '../plazbot/plazbot.module';
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import { WhatsAppSenderService } from './whatsapp-sender.service';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import { WhatsAppTemplatesController } from './whatsapp-templates.controller';
import { WhatsAppBillingService } from './whatsapp-billing.service';
import { AdminWhatsAppConsumptionController, WhatsAppConsumptionController } from './whatsapp-consumption.controller';
import { TeamModule } from '../team/team.module';

@Module({
    imports: [TypeOrmModule.forFeature([WhatsAppNumber, Place]), PlazBotModule, TeamModule],
    controllers: [WhatsAppTemplatesController, WhatsAppConsumptionController, AdminWhatsAppConsumptionController],
    providers: [WhatsAppCloudService, WhatsAppSenderService, WhatsAppTemplatesService, WhatsAppBillingService],
    exports: [WhatsAppCloudService, WhatsAppSenderService, WhatsAppTemplatesService, WhatsAppBillingService],
})
export class MessagingModule {}
