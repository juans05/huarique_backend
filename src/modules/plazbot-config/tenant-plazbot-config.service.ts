import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantPlazbotConfig } from './entities/tenant-plazbot-config.entity';

@Injectable()
export class TenantPlazbotConfigService {
  private readonly logger = new Logger(TenantPlazbotConfigService.name);

  constructor(
    @InjectRepository(TenantPlazbotConfig)
    private configRepo: Repository<TenantPlazbotConfig>
  ) {}

  async findByUserId(userId: string) {
    return this.configRepo.findOne({
      where: { userId, isActive: true },
    });
  }

  async findByWorkspaceId(workspaceId: string) {
    return this.configRepo.findOne({
      where: { plazBotWorkspaceId: workspaceId, isActive: true },
    });
  }

  async createOrUpdate(
    userId: string,
    data: {
      plazBotApiKey: string;
      plazBotWorkspaceId: string;
      agentId: string;
      placeId?: string;
      systemPrompt?: string;
      tone?: 'professional' | 'casual' | 'friendly';
      reservationTagId?: string;
      fallbackTemplateId?: string;
    }
  ) {
    let config = await this.configRepo.findOne({
      where: { userId },
    });

    if (config) {
      // Si apiKey viene vacío en edición, conservar el existente
      const update = data.plazBotApiKey ? data : { ...data, plazBotApiKey: config.plazBotApiKey };
      Object.assign(config, update);
      return this.configRepo.save(config);
    }

    config = this.configRepo.create({
      userId,
      ...data,
    });

    return this.configRepo.save(config);
  }

  async deactivate(userId: string) {
    return this.configRepo.update(
      { userId },
      { isActive: false }
    );
  }
}
