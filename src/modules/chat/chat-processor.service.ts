import { Injectable, Logger } from '@nestjs/common';
import { PlazBotService } from '../plazbot/plazbot.service';
import { DocumentsService } from '../documents/documents.service';
import { TenantPlazbotConfigService } from '../plazbot-config/tenant-plazbot-config.service';
import { Anthropic } from '@anthropic-ai/sdk';

@Injectable()
export class ChatProcessorService {
  private readonly logger = new Logger(ChatProcessorService.name);
  private anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  constructor(
    private plazbot: PlazBotService,
    private documents: DocumentsService,
    private tenantConfig: TenantPlazbotConfigService
  ) {}

  async processIncomingMessage(
    userId: string,
    plazBotPayload: {
      contact: { id: string; name: string; phone: string };
      message: { id: string; body: string };
    }
  ) {
    try {
      const { contact, message } = plazBotPayload;

      this.logger.log(
        `Processing: ${contact.name} - "${message.body}"`
      );

      // 1. OBTENER CONFIG PLAZBOT
      const tenantConfig = await this.tenantConfig.findByUserId(userId);
      if (!tenantConfig) {
        throw new Error('Plazbot not configured');
      }

      const apiKey = this.decryptSecret(tenantConfig.plazBotApiKey);
      const workspaceId = tenantConfig.plazBotWorkspaceId;

      // 2. SINCRONIZAR CONTACTO
      let plazContact = await this.plazbot.getContact(
        apiKey,
        workspaceId,
        contact.phone
      );

      if (!plazContact) {
        plazContact = await this.plazbot.createContact(
          apiKey,
          workspaceId,
          { name: contact.name, phone: contact.phone }
        );
      }

      // 3. OBTENER CONTEXTO DE TU BD
      const documentContext = await this.documents.getFullContext(userId);

      // 4. OBTENER HISTORIAL
      const history = await this.plazbot.getConversationHistory(
        apiKey,
        workspaceId,
        plazContact.id
      );

      // 5. CONSTRUIR SYSTEM PROMPT
      const systemPrompt = `Eres un asistente inteligente para un restaurante.

INFORMACIÓN DEL RESTAURANTE:
${documentContext}

Responde siempre en español, de manera amable y profesional.
Si el cliente pregunta sobre menú, horarios o políticas, usa la información anterior.
Si no sabes algo, ofrece conectar con el staff del restaurante.`;

      // 6. LLAMAR CLAUDE
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 512,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: message.body,
          },
        ],
      });

      const botResponse =
        response.content[0].type === 'text' ? response.content[0].text : '';

      this.logger.log(`Generated response: ${botResponse}`);

      // 7. ENVIAR A PLAZBOT
      await this.plazbot.sendMessage(
        apiKey,
        workspaceId,
        plazContact.id,
        botResponse
      );

      // 8. ACTUALIZAR CONTACTO (si es necesario)
      if (this.isReservationQuery(message.body)) {
        await this.plazbot.updateContact(apiKey, workspaceId, plazContact.id, {
          tags: ['interested-in-reservation'],
          stage: 'interested',
        });
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Error processing message:', error);
      throw error;
    }
  }

  private isReservationQuery(message: string): boolean {
    const keywords = ['reserva', 'mesa', 'horario', 'disponible'];
    return keywords.some((kw) =>
      message.toLowerCase().includes(kw)
    );
  }

  private decryptSecret(encrypted: string): string {
    // TODO: implementar encriptación real
    return encrypted;
  }
}
