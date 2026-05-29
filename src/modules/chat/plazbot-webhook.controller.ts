import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ChatProcessorService } from './chat-processor.service';
import { TenantPlazbotConfigService } from '../plazbot-config/tenant-plazbot-config.service';

@Controller('api/webhooks/plazbot')
export class PlazBotWebhookController {
  private readonly logger = new Logger(PlazBotWebhookController.name);

  constructor(
    private chatProcessor: ChatProcessorService,
    private tenantConfig: TenantPlazbotConfigService
  ) {}

  @Post()
  async handleWebhook(@Body() payload: any) {
    this.logger.log('Webhook received');

    try {
      const { event, workspace_id, contact, message } = payload;

      if (event !== 'message_received') {
        return { status: 'ok' };
      }

      const config = await this.tenantConfig.findByWorkspaceId(
        workspace_id
      );

      if (!config) {
        this.logger.warn(`Unknown workspace: ${workspace_id}`);
        return { status: 'ok' };
      }

      await this.chatProcessor.processIncomingMessage(config.userId, {
        contact,
        message,
      });

      return { status: 'ok' };
    } catch (error) {
      this.logger.error('Error:', error);
      return { status: 'ok' };
    }
  }
}
