import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { PlazBotModule } from '../plazbot/plazbot.module';
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import { WhatsAppSenderService } from './whatsapp-sender.service';

@Module({
    imports: [TypeOrmModule.forFeature([WhatsAppNumber]), PlazBotModule],
    providers: [WhatsAppCloudService, WhatsAppSenderService],
    exports: [WhatsAppCloudService, WhatsAppSenderService],
})
export class MessagingModule {}
