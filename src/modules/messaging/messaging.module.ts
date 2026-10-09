import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { Place } from '../places/entities/place.entity';
import { PlazBotModule } from '../plazbot/plazbot.module';
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import { WhatsAppSenderService } from './whatsapp-sender.service';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import { WhatsAppTemplatesController } from './whatsapp-templates.controller';
import { TeamModule } from '../team/team.module';

@Module({
    imports: [TypeOrmModule.forFeature([WhatsAppNumber, Place]), PlazBotModule, TeamModule],
    controllers: [WhatsAppTemplatesController],
    providers: [WhatsAppCloudService, WhatsAppSenderService, WhatsAppTemplatesService],
    exports: [WhatsAppCloudService, WhatsAppSenderService, WhatsAppTemplatesService],
})
export class MessagingModule {}
