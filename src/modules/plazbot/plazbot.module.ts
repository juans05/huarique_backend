import { Module } from '@nestjs/common';
import { PlazBotService } from './plazbot.service';
import { PlazBotAdvancedService } from './plazbot-advanced.service';

@Module({
  providers: [PlazBotService, PlazBotAdvancedService],
  exports: [PlazBotService, PlazBotAdvancedService],
})
export class PlazBotModule {}
