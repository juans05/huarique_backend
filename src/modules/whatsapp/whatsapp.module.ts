import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { ConversationsController } from './conversations.controller';
import { WhatsAppNumbersController } from './whatsapp-numbers.controller';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Place } from '../places/entities/place.entity';
import { PlacesModule } from '../places/places.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { PlazBotModule } from '../plazbot/plazbot.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([WhatsAppNumber, Conversation, Message, Place]),
        PlacesModule,
        AiModule,
        AuthModule,
        PlazBotModule,
        SubscriptionsModule,
    ],
    controllers: [WhatsappController, ConversationsController, WhatsAppNumbersController],
    providers: [WhatsappService],
    exports: [WhatsappService, TypeOrmModule],
})
export class WhatsAppModule {}
