import { Controller, Post, Get, Body, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaceBotConfigService } from './place-bot-config.service';
import { PlazBotService } from '../plazbot/plazbot.service';
import { PlazBotAdvancedService } from '../plazbot/plazbot-advanced.service';

@UseGuards(JwtAuthGuard)
@Controller('plazbot-setup')
export class PlazbotConfigController {
  constructor(
    private botConfigService: PlaceBotConfigService,
    private plazBotService: PlazBotService,
    private plazBotAdvanced: PlazBotAdvancedService,
  ) {}

  // Configuración del bot para un restaurante específico
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

  // Guardar configuración del bot para un restaurante
  @Post('configure')
  async configure(
    @Body()
    dto: {
      placeId: string;
      systemPrompt?: string;
      tone?: 'professional' | 'casual' | 'friendly';
    },
  ) {
    const saved = await this.botConfigService.createOrUpdate(dto.placeId, {
      systemPrompt: dto.systemPrompt,
      tone: dto.tone,
    });
    return { ...saved, webhookUrl: this.getWebhookUrl() };
  }

  // Estado de conexión de PlazBot (credenciales globales del sistema)
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

  // Templates disponibles en la cuenta PlazBot de wuarikes
  @Get('templates')
  async getTemplates() {
    const { apiKey, workspaceId } = this.getGlobalCreds();
    return this.plazBotAdvanced.listActiveTemplates(apiKey, workspaceId);
  }

  // Métricas del workspace PlazBot
  @Get('metrics')
  async getMetrics() {
    const { apiKey, workspaceId } = this.getGlobalCreds();
    return this.plazBotAdvanced.getWorkspaceMetrics(apiKey, workspaceId);
  }

  // Enviar template a un contacto (uso manual desde el dashboard)
  @Post('send-template')
  async sendTemplate(
    @Body()
    dto: {
      template: string;
      destination: string;
      variablesBody?: { variable: string; value: string }[];
    },
  ) {
    const { apiKey, workspaceId } = this.getGlobalCreds();
    return this.plazBotAdvanced.sendTemplateMessage(apiKey, workspaceId, dto);
  }

  // Crear plantilla en PlazBot (requiere aprobación Meta)
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
    },
  ) {
    const { apiKey, workspaceId } = this.getGlobalCreds();
    return this.plazBotAdvanced.createTemplate(apiKey, workspaceId, dto);
  }

  // Crear campaña masiva
  @Post('campaign')
  async createCampaign(
    @Body() dto: { name: string; templateId: string; contacts: string[] },
  ) {
    const { apiKey, workspaceId } = this.getGlobalCreds();
    return this.plazBotAdvanced.createCampaign(apiKey, workspaceId, dto);
  }

  private getGlobalCreds() {
    const apiKey = process.env.PLAZBOT_API_KEY || '';
    const workspaceId = process.env.PLAZBOT_WORKSPACE_ID || '';
    return { apiKey, workspaceId };
  }

  private getWebhookUrl(): string {
    const base = process.env.BACKEND_URL || 'https://backendwarike-production.up.railway.app';
    return `${base}/webhooks/plazbot`;
  }
}
