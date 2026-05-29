import { Controller, Post, Body, Request } from '@nestjs/common';
import { TenantPlazbotConfigService } from './tenant-plazbot-config.service';

@Controller('api/plazbot-setup')
export class PlazbotConfigController {
  constructor(private configService: TenantPlazbotConfigService) {}

  @Post('connect')
  async connectPlazbot(
    @Body() dto: {
      apiKey: string;
      workspaceId: string;
      agentId: string;
      systemPrompt?: string;
      tone?: 'professional' | 'casual' | 'friendly';
    },
    @Request() req
  ) {
    const userId = (req as any).user?.id;
    if (!userId) throw new Error('User not found');

    return this.configService.createOrUpdate(userId, {
      plazBotApiKey: dto.apiKey,
      plazBotWorkspaceId: dto.workspaceId,
      agentId: dto.agentId,
      systemPrompt: dto.systemPrompt,
      tone: dto.tone || 'professional',
    });
  }
}
