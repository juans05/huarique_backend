import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaceBotConfigService } from './place-bot-config.service';
import { BotMenuOptionService } from './bot-menu-option.service';
import { PlaceTeamService } from '../team/place-team.service';

// Configuración del bot de WhatsApp por sede (nombre, personalidad, menú). La ruta conserva el nombre
// histórico `plazbot-setup` para no romper el panel; ya no tiene relación con PlazBot.
@UseGuards(JwtAuthGuard)
@Controller('plazbot-setup')
export class PlazbotConfigController {
  constructor(
    private botConfigService: PlaceBotConfigService,
    private menuOptionService: BotMenuOptionService,
    private placeTeamService: PlaceTeamService,
  ) {}

  @Get('config')
  async getConfig(@CurrentUser() user: any, @Query('placeId') placeId: string) {
    if (placeId) await this.placeTeamService.assertAccess(user.id, placeId, 'ia_total');
    const config = placeId ? await this.botConfigService.findByPlaceId(placeId) : null;
    return {
      placeId: placeId || null,
      botName: config?.botName || null,
      restaurantName: config?.restaurantName || null,
      systemPrompt: config?.systemPrompt || null,
      tone: config?.tone || 'professional',
      isActive: config?.isActive ?? true,
      responseMode: config?.responseMode || 'ai',
    };
  }

  @Post('configure')
  async configure(
    @CurrentUser() user: any,
    @Body() dto: {
      placeId: string;
      botName?: string;
      restaurantName?: string;
      systemPrompt?: string;
      tone?: 'professional' | 'casual' | 'friendly';
      responseMode?: 'ai' | 'menu';
    },
  ) {
    await this.placeTeamService.assertAccess(user.id, dto.placeId, 'ia_total');
    const saved = await this.botConfigService.createOrUpdate(dto.placeId, {
      botName: dto.botName,
      restaurantName: dto.restaurantName,
      systemPrompt: dto.systemPrompt,
      tone: dto.tone,
      responseMode: dto.responseMode,
    });
    return saved;
  }

  // ── Opciones del menú de botones (modo "menu") ──

  @Get('menu-options')
  async getMenuOptions(@CurrentUser() user: any, @Query('placeId') placeId: string) {
    await this.placeTeamService.assertAccess(user.id, placeId, 'ia_total');
    const options = await this.menuOptionService.findByPlaceId(placeId);
    return { data: options };
  }

  @Post('menu-options')
  async saveMenuOptions(
    @CurrentUser() user: any,
    @Body() dto: {
      placeId: string;
      options: { label: string; actionType: 'file' | 'text' | 'human'; actionValue?: string }[];
    },
  ) {
    await this.placeTeamService.assertAccess(user.id, dto.placeId, 'ia_total');
    const saved = await this.menuOptionService.replaceAll(dto.placeId, dto.options);
    return { data: saved };
  }
}
