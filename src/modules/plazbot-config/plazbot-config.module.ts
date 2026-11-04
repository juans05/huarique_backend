import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceBotConfig } from './entities/place-bot-config.entity';
import { BotMenuOption } from './entities/bot-menu-option.entity';
import { PlaceBotConfigService } from './place-bot-config.service';
import { BotMenuOptionService } from './bot-menu-option.service';
import { PlazbotConfigController } from './plazbot-config.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TeamModule } from '../team/team.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlaceBotConfig, BotMenuOption]),
    SubscriptionsModule,
    TeamModule,
  ],
  providers: [PlaceBotConfigService, BotMenuOptionService],
  controllers: [PlazbotConfigController],
  exports: [PlaceBotConfigService, BotMenuOptionService],
})
export class PlazbotConfigModule {}
