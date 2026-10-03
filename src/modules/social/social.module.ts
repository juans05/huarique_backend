import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialController } from './social.controller';
import { SocialStatsController } from './social-stats.controller';
import { SocialCallbackController } from './social-callback.controller';
import { ZernioWebhookController } from './zernio-webhook.controller';
import { SocialAccount } from './entities/social-account.entity';
import { SocialComment } from './entities/social-comment.entity';
import { SocialBotRule } from './entities/social-bot-rule.entity';
import { Place } from '../places/entities/place.entity';
import { ZernioService } from './zernio.service';
import { SocialAiService } from './social-ai.service';
import { ChatModule } from '../chat/chat.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([SocialAccount, SocialComment, SocialBotRule, Place]),
        ChatModule, // agente inteligente (carta + base de conocimiento) para los DM
    ],
    controllers: [SocialController, SocialStatsController, SocialCallbackController, ZernioWebhookController],
    providers: [ZernioService, SocialAiService],
    exports: [],
})
export class SocialModule {}
