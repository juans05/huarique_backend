import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceBotConfig } from './entities/place-bot-config.entity';
import { PlaceBotConfigService } from './place-bot-config.service';
import { PlazbotConfigController } from './plazbot-config.controller';
import { PlazBotModule } from '../plazbot/plazbot.module';

@Module({
  imports: [TypeOrmModule.forFeature([PlaceBotConfig]), PlazBotModule],
  providers: [PlaceBotConfigService],
  controllers: [PlazbotConfigController],
  exports: [PlaceBotConfigService],
})
export class PlazbotConfigModule {}
