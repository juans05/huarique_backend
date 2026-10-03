import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { MetaConnectController } from './meta-connect.controller';
import { MetaConnectService } from './meta-connect.service';
import { ConversationsController } from './conversations.controller';
import { WhatsAppNumbersController, AdminWhatsAppNumbersController } from './whatsapp-numbers.controller';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Place } from '../places/entities/place.entity';
import { PlacesModule } from '../places/places.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { PlazBotModule } from '../plazbot/plazbot.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ChatModule } from '../chat/chat.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TeamModule } from '../team/team.module';
import { UploadModule } from '../upload/upload.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([WhatsAppNumber, Conversation, Message, Place]),
        PlacesModule,
        AiModule,
        AuthModule,
        PlazBotModule,
        MessagingModule,
        ChatModule, // agente inteligente que procesa los mensajes que llegan por la API de Meta
        SubscriptionsModule,
        TeamModule,
        UploadModule,
    ],
    controllers: [WhatsappController, MetaConnectController, ConversationsController, WhatsAppNumbersController, AdminWhatsAppNumbersController],
    providers: [WhatsappService, MetaConnectService],
    exports: [WhatsappService, TypeOrmModule],
})
export class WhatsAppModule {}
