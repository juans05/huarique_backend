import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlaceBotConfig } from './entities/place-bot-config.entity';

@Injectable()
export class PlaceBotConfigService {
  constructor(
    @InjectRepository(PlaceBotConfig)
    private repo: Repository<PlaceBotConfig>,
  ) {}

  findByPlaceId(placeId: string) {
    return this.repo.findOne({ where: { placeId } });
  }

  async createOrUpdate(
    placeId: string,
    data: { systemPrompt?: string; tone?: 'professional' | 'casual' | 'friendly'; isActive?: boolean },
  ) {
    let config = await this.repo.findOne({ where: { placeId } });

    if (config) {
      Object.assign(config, data);
      return this.repo.save(config);
    }

    config = this.repo.create({ placeId, ...data });
    return this.repo.save(config);
  }
}
