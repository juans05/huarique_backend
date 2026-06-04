import { Controller, Post, Get, Put, Delete, Body, Query, Param, UseGuards, HttpCode, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
    @InjectRepository(Place)
    private placesRepo: Repository<Place>,
  ) {}

  private async assertOwner(placeId: string, userId: string) {
    const place = await this.placesRepo.findOne({ where: { id: placeId } });
    if (!place) throw new NotFoundException('Local no encontrado');
    if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
  }

  @Get('config')
  async getConfig(@CurrentUser() user: any, @Query('placeId') placeId: string) {
    if (placeId) await this.assertOwner(placeId, user.id);
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
    await this.assertOwner(dto.placeId, user.id);
    const saved = await this.botConfigService.createOrUpdate(dto.placeId, {
      botName: dto.botName,
      restaurantName: dto.restaurantName,
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

  @Delete('templates/:id')
  @HttpCode(204)
  async deleteTemplate(@Param('id') id: string) {
    await this.templateService.delete(id);
  }

  @Post('templates/:id/toggle')
  async toggleTemplate(@Param('id') id: string) {
    return this.templateService.toggle(id);
  }

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
    const base = process.env.BACKEND_URL || '';
    if (!base) return '';
    return `${base}/webhooks/plazbot`;
  }
}
