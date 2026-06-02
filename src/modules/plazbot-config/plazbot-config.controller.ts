import { Controller, Post, Get, Body, Query, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaceBotConfigService } from './place-bot-config.service';
import { PlazBotAdvancedService } from '../plazbot/plazbot-advanced.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';

@UseGuards(JwtAuthGuard)
@Controller('plazbot-setup')
export class PlazbotConfigController {
  constructor(
    private botConfigService: PlaceBotConfigService,
    private plazBotAdvanced: PlazBotAdvancedService,
    private templateService: WhatsAppTemplateService,
  ) {}

  @Get('config')
  async getConfig(@Query('placeId') placeId: string) {
    const config = placeId ? await this.botConfigService.findByPlaceId(placeId) : null;
    return {
      placeId: placeId || null,
      systemPrompt: config?.systemPrompt || null,
      tone: config?.tone || 'professional',
      isActive: config?.isActive ?? true,
      webhookUrl: this.getWebhookUrl(),
    };
  }

  @Post('configure')
  async configure(
    @Body() dto: { placeId: string; systemPrompt?: string; tone?: 'professional' | 'casual' | 'friendly' },
  ) {
    const saved = await this.botConfigService.createOrUpdate(dto.placeId, {
      systemPrompt: dto.systemPrompt,
      tone: dto.tone,
    });
    return { ...saved, webhookUrl: this.getWebhookUrl() };
  }

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

  @Get('metrics')
  async getMetrics() {
    const { apiKey, workspaceId } = this.getGlobalCreds();
    return this.plazBotAdvanced.getWorkspaceMetrics(apiKey, workspaceId);
  }

  // ── Templates (guardados en DB + enviados a PlazBot) ──

  @Get('templates')
  async getTemplates() {
    return this.templateService.findAll();
  }

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

  @Post('templates/:id/resend')
  async resendTemplate(@Param('id') id: string) {
    return this.templateService.resend(id);
  }

  @Post('templates/sync')
  async syncTemplates() {
    return this.templateService.syncStatuses();
  }

  // ── Envío de mensajes ──

  @Post('send-template')
  async sendTemplate(
    @Body() dto: { template: string; destination: string; variablesBody?: { variable: string; value: string }[] },
  ) {
    const { apiKey, workspaceId } = this.getGlobalCreds();
    return this.plazBotAdvanced.sendTemplateMessage(apiKey, workspaceId, dto);
  }

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
    const base = process.env.BACKEND_URL || 'https://backendwarike-production.up.railway.app';
    return `${base}/webhooks/plazbot`;
  }
}
