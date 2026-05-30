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
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { PlazBotModule } from '../plazbot/plazbot.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([WhatsAppNumber, Conversation, Message, Place]),
        AiModule,
        AuthModule,
        PlazBotModule,
    ],
    controllers: [WhatsappController, ConversationsController, WhatsAppNumbersController],
    providers: [WhatsappService],
    exports: [WhatsappService, TypeOrmModule],
})
export class WhatsAppModule {}
