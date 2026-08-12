import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceBotConfig } from './entities/place-bot-config.entity';
import { WhatsAppTemplate } from './entities/whatsapp-template.entity';
import { BotMenuOption } from './entities/bot-menu-option.entity';
import { PlaceBotConfigService } from './place-bot-config.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { BotMenuOptionService } from './bot-menu-option.service';
import { PlazbotConfigController } from './plazbot-config.controller';
import { PlazBotModule } from '../plazbot/plazbot.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TeamModule } from '../team/team.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlaceBotConfig, WhatsAppTemplate, BotMenuOption]),
    PlazBotModule,
    SubscriptionsModule,
    TeamModule,
  ],
  providers: [PlaceBotConfigService, WhatsAppTemplateService, BotMenuOptionService],
  controllers: [PlazbotConfigController],
  exports: [PlaceBotConfigService, WhatsAppTemplateService, BotMenuOptionService],
})
export class PlazbotConfigModule {}
