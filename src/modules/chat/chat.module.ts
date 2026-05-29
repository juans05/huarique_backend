import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PlazBotModule } from '../plazbot/plazbot.module';
import { PlazbotConfigModule } from '../plazbot-config/plazbot-config.module';
import { ChatProcessorService } from './chat-processor.service';
import { PlazBotWebhookController } from './plazbot-webhook.controller';

@Module({
  imports: [AiModule, PlazBotModule, PlazbotConfigModule],
  providers: [ChatProcessorService],
  controllers: [PlazBotWebhookController],
})
export class ChatModule {}
