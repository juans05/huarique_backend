import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSettings, PLATFORM_SETTINGS_ID } from './entities/platform-settings.entity';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

@Injectable()
export class PlatformSettingsService {
    constructor(
        @InjectRepository(PlatformSettings)
        private settingsRepository: Repository<PlatformSettings>,
    ) { }

    async getSettings(): Promise<PlatformSettings> {
        const settings = await this.settingsRepository.findOneBy({ id: PLATFORM_SETTINGS_ID });
        return settings ?? this.settingsRepository.save(this.settingsRepository.create({ id: PLATFORM_SETTINGS_ID }));
    }

    async updateSettings(dto: UpdatePlatformSettingsDto): Promise<PlatformSettings> {
        await this.getSettings();
        await this.settingsRepository.update({ id: PLATFORM_SETTINGS_ID }, dto);
        return this.getSettings();
    }
}
