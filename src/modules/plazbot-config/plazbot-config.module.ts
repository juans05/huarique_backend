import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceBotConfig } from './entities/place-bot-config.entity';
import { WhatsAppTemplate } from './entities/whatsapp-template.entity';
import { Place } from '../places/entities/place.entity';
import { PlaceBotConfigService } from './place-bot-config.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { PlazbotConfigController } from './plazbot-config.controller';
import { PlazBotModule } from '../plazbot/plazbot.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlaceBotConfig, WhatsAppTemplate, Place]),
    PlazBotModule,
    SubscriptionsModule,
  ],
  providers: [PlaceBotConfigService, WhatsAppTemplateService],
  controllers: [PlazbotConfigController],
  exports: [PlaceBotConfigService, WhatsAppTemplateService],
})
export class PlazbotConfigModule {}
