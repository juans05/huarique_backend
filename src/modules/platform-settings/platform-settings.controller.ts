import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('platform-settings')
@Controller('platform-settings')
export class PlatformSettingsController {
    constructor(private readonly platformSettingsService: PlatformSettingsService) { }

    @Get()
    @ApiOperation({ summary: 'Get public platform settings (contact info, social links)' })
    @ApiResponse({ status: 200, description: 'Current platform settings.' })
    async getSettings() {
        return this.platformSettingsService.getSettings();
    }

    @Patch()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update platform settings (admin only)' })
    @ApiResponse({ status: 200, description: 'Updated platform settings.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
    async updateSettings(@Body() dto: UpdatePlatformSettingsDto) {
        return this.platformSettingsService.updateSettings(dto);
    }
}
