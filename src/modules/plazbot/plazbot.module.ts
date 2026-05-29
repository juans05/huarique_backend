import { Module } from '@nestjs/common';
import { PlazBotService } from './plazbot.service';
import { PlazbotConfigModule } from '../plazbot-config/plazbot-config.module';

@Module({
  imports: [PlazbotConfigModule],
  providers: [PlazBotService],
  exports: [PlazBotService],
})
export class PlazBotModule {}
