import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { PlazBotModule } from '../plazbot/plazbot.module';
import { PlacesModule } from '../places/places.module';
import { PlazbotConfigModule } from '../plazbot-config/plazbot-config.module';
import { Conversation } from '../whatsapp/entities/conversation.entity';
import { Message } from '../whatsapp/entities/message.entity';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { Place } from '../places/entities/place.entity';
import { ChatProcessorService } from './chat-processor.service';
import { PlazBotWebhookController } from './plazbot-webhook.controller';
import { DemoChatController } from './demo-chat.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, WhatsAppNumber, Place]),
    PlacesModule,
    AiModule,
    PlazBotModule,
    PlazbotConfigModule,  // provee PlaceBotConfigService
  ],
  providers: [ChatProcessorService],
  controllers: [PlazBotWebhookController, DemoChatController],
})
export class ChatModule {}
