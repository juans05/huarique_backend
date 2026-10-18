import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PlacesModule } from '../places/places.module';
import { PlazbotConfigModule } from '../plazbot-config/plazbot-config.module';
import { Conversation } from '../whatsapp/entities/conversation.entity';
import { Message } from '../whatsapp/entities/message.entity';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { Place } from '../places/entities/place.entity';
import { OrdersModule } from '../orders/orders.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ChatProcessorService } from './chat-processor.service';
import { PlazBotWebhookController } from './plazbot-webhook.controller';
import { DemoChatController } from './demo-chat.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, WhatsAppNumber, Place]),
    PlacesModule,
    AiModule,
    MessagingModule,
    PlazbotConfigModule,  // provee PlaceBotConfigService
    OrdersModule,  // provee OrderAgentService (pedidos por WhatsApp)
    ContactsModule,  // provee ContactsService (cliente único)
  ],
  providers: [ChatProcessorService],
  exports: [ChatProcessorService],
  controllers: [PlazBotWebhookController, DemoChatController],
})
export class ChatModule {}
