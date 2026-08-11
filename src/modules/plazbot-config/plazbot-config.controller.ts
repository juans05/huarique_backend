import { Controller, Post, Get, Put, Delete, Body, Query, Param, UseGuards, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaceBotConfigService } from './place-bot-config.service';
import { PlazBotAdvancedService } from '../plazbot/plazbot-advanced.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { SubscriptionTierGuard } from '../../common/guards/subscription-tier.guard';
import { RequiresTier } from '../../common/decorators/requires-tier.decorator';
import { PlaceTeamService } from '../team/place-team.service';

// `config`/`configure` son por sede — el plan se resuelve vía la sede (dueño o
// equipo), no vía el guard genérico. El resto de las rutas de este controller
// (templates, campañas, envío) son configuración GLOBAL del workspace de
// WhatsApp compartido, sin concepto de sede — esas sí siguen gateadas por el
// plan propio del usuario que llama, con el guard de siempre a nivel método.
@UseGuards(JwtAuthGuard)
@Controller('plazbot-setup')
export class PlazbotConfigController {
  constructor(
    private botConfigService: PlaceBotConfigService,
    private plazBotAdvanced: PlazBotAdvancedService,
    private templateService: WhatsAppTemplateService,
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
      webhookUrl: this.getWebhookUrl(),
    };
  }

  @Post('configure')
  async configure(
    @CurrentUser() user: any,
    @Body() dto: { placeId: string; botName?: string; restaurantName?: string; systemPrompt?: string; tone?: 'professional' | 'casual' | 'friendly' },
  ) {
    await this.placeTeamService.assertAccess(user.id, dto.placeId, 'ia_total');
    const saved = await this.botConfigService.createOrUpdate(dto.placeId, {
      botName: dto.botName,
      restaurantName: dto.restaurantName,
      systemPrompt: dto.systemPrompt,
      tone: dto.tone,
    });
    return { ...saved, webhookUrl: this.getWebhookUrl() };
  }

  @UseGuards(SubscriptionTierGuard)
  @RequiresTier('ia_total')
  @Get('status')
  getStatus() {
    const apiKey = process.env.PLAZBOT_API_KEY;
    const workspaceId = process.env.PLAZBOT_WORKSPACE_ID;
    return {
      connected: !!(apiKey && workspaceId),
      workspaceId: workspaceId || null,
      webhookUrl: this.getWebhookUrl(),
    };
  }

  @UseGuards(SubscriptionTierGuard)
  @RequiresTier('ia_total')
  @Get('metrics')
  async getMetrics() {
    const { apiKey, workspaceId } = this.getGlobalCreds();
    return this.plazBotAdvanced.getWorkspaceMetrics(apiKey, workspaceId);
  }

  // ── Templates (guardados en DB + enviados a PlazBot) ──

  @UseGuards(SubscriptionTierGuard)
  @RequiresTier('ia_total')
  @Get('templates')
  async getTemplates() {
    return this.templateService.findAll();
  }

  @UseGuards(SubscriptionTierGuard)
  @RequiresTier('ia_total')
  @Post('template')
  async createTemplate(
    @Body() dto: {
      elementName: string;
      category: string;
      languageCode: string;
      headerText?: string;
      body: string;
      footer?: string;
      quickReplies?: { text: string }[];
      ctaButtons?: { text: string; type: string; value: string }[];
      variableSamples?: Record<number, { value: string; type: string }>;
    },
  ) {
    return this.templateService.createAndSubmit(dto);
  }

  @UseGuards(SubscriptionTierGuard)
  @RequiresTier('ia_total')
  @Post('templates/:id/resend')
  async resendTemplate(@Param('id') id: string) {
    return this.templateService.resend(id);
  }

  @UseGuards(SubscriptionTierGuard)
  @RequiresTier('ia_total')
  @Post('templates/sync')
  async syncTemplates() {
    return this.templateService.syncStatuses();
  }

  @UseGuards(SubscriptionTierGuard)
  @RequiresTier('ia_total')
  @Delete('templates/:id')
  @HttpCode(204)
  async deleteTemplate(@Param('id') id: string) {
    await this.templateService.delete(id);
  }

  @UseGuards(SubscriptionTierGuard)
  @RequiresTier('ia_total')
  @Post('templates/:id/toggle')
  async toggleTemplate(@Param('id') id: string) {
    return this.templateService.toggle(id);
  }

  @UseGuards(SubscriptionTierGuard)
  @RequiresTier('ia_total')
  @Put('templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: {
      elementName: string;
      category: string;
      languageCode: string;
      headerText?: string;
      body: string;
      footer?: string;
      quickReplies?: { text: string }[];
      ctaButtons?: { text: string; type: string; value: string }[];
      variableSamples?: Record<number, { value: string; type: string }>;
    },
  ) {
    const { apiKey, workspaceId } = this.getGlobalCreds();
    return this.plazBotAdvanced.updateTemplate(apiKey, workspaceId, id, dto);
  }

  // ── Envío de mensajes ──

  @UseGuards(SubscriptionTierGuard)
  @RequiresTier('ia_total')
  @Post('send-template')
  async sendTemplate(
    @Body() dto: { template: string; destination: string; variablesBody?: { variable: string; value: string }[] },
  ) {
    const { apiKey, workspaceId } = this.getGlobalCreds();
    return this.plazBotAdvanced.sendTemplateMessage(apiKey, workspaceId, dto);
  }

  @UseGuards(SubscriptionTierGuard)
  @RequiresTier('ia_total')
  @Post('campaign')
  async createCampaign(
    @Body() dto: { name: string; templateId: string; contacts: string[] },
  ) {
    const { apiKey, workspaceId } = this.getGlobalCreds();
    return this.plazBotAdvanced.createCampaign(apiKey, workspaceId, dto);
  }

  private getGlobalCreds() {
    return {
      apiKey: process.env.PLAZBOT_API_KEY || '',
      workspaceId: process.env.PLAZBOT_WORKSPACE_ID || '',
    };
  }

  private getWebhookUrl(): string {
    const base = process.env.BACKEND_URL || '';
    if (!base) return '';
    return `${base}/webhooks/plazbot`;
  }
}
