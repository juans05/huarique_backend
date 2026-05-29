import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantPlazbotConfig } from './entities/tenant-plazbot-config.entity';
import { TenantPlazbotConfigService } from './tenant-plazbot-config.service';
import { PlazbotConfigController } from './plazbot-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TenantPlazbotConfig])],
  providers: [TenantPlazbotConfigService],
  controllers: [PlazbotConfigController],
  exports: [TenantPlazbotConfigService],
})
export class PlazbotConfigModule {}
