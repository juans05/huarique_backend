import { Injectable, Logger } from '@nestjs/common';
import { PlazBotService } from '../plazbot/plazbot.service';
import { TenantPlazbotConfigService } from '../plazbot-config/tenant-plazbot-config.service';
import { VectorService } from '../ai/vector.service';
import { Anthropic } from '@anthropic-ai/sdk';

@Injectable()
export class ChatProcessorService {
  private readonly logger = new Logger(ChatProcessorService.name);
  private anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  constructor(
    private plazbot: PlazBotService,
    private tenantConfig: TenantPlazbotConfigService,
    private vectorService: VectorService,
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

      this.logger.log(`Processing: ${contact.name} - "${message.body}"`);

      // 1. OBTENER CONFIG PLAZBOT
      const tenantConfig = await this.tenantConfig.findByUserId(userId);
      if (!tenantConfig) throw new Error('Plazbot not configured');

      const apiKey = this.decryptSecret(tenantConfig.plazBotApiKey);
      const workspaceId = tenantConfig.plazBotWorkspaceId;

      // 2. SINCRONIZAR CONTACTO
      let plazContact = await this.plazbot.getContact(apiKey, workspaceId, contact.phone);
      if (!plazContact) {
        plazContact = await this.plazbot.createContact(apiKey, workspaceId, {
          name: contact.name,
          phone: contact.phone,
        });
      }

      // 3. RAG: buscar chunks relevantes de la knowledge base del local
      let ragContext = '';
      if (tenantConfig.placeId) {
        try {
          const chunks = await this.vectorService.searchSimilarity(
            tenantConfig.placeId,
            message.body,
            5,
          );
          if (chunks.length > 0) {
            ragContext = chunks.join('\n\n');
            this.logger.log(`RAG: ${chunks.length} chunks encontrados para placeId ${tenantConfig.placeId}`);
          } else {
            this.logger.warn(`RAG: sin chunks para placeId ${tenantConfig.placeId}`);
          }
        } catch (err) {
          this.logger.error('RAG search failed, continuando sin contexto:', err);
        }
      } else {
        this.logger.warn(`PlazBot config sin placeId para userId ${userId} — RAG deshabilitado`);
      }

      // 4. OBTENER HISTORIAL DE CONVERSACIÓN
      const rawHistory = await this.plazbot.getConversationHistory(
        apiKey,
        workspaceId,
        plazContact.id,
      );

      // Mapear historial al formato de mensajes de Claude (últimos 10 turnos)
      // Claude requiere que los roles alternen estrictamente — deduplicamos consecutivos
      const historyMessages: Anthropic.MessageParam[] = rawHistory
        .slice(-10)
        .map((entry: any) => ({
          role: (entry.role === 'agent' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: entry.message || entry.body || entry.content || '',
        }))
        .filter((m: { role: string; content: string }) => m.content.length > 0)
        .reduce((acc: Anthropic.MessageParam[], curr: { role: 'user' | 'assistant'; content: string }) => {
          if (acc.length > 0 && acc[acc.length - 1].role === curr.role) {
            return acc;
          }
          acc.push(curr);
          return acc;
        }, []);

      // 5. CONSTRUIR SYSTEM PROMPT
      const systemPrompt = ragContext
        ? `Eres un asistente inteligente para un restaurante.

INFORMACIÓN RELEVANTE DEL RESTAURANTE:
${ragContext}

Responde siempre en español, de manera amable y profesional.
Usa únicamente la información anterior para responder. Si no encuentras la respuesta, ofrece conectar con el equipo del restaurante.`
        : `Eres un asistente inteligente para un restaurante.
Responde siempre en español, de manera amable y profesional.
Si no sabes algo, ofrece conectar con el staff del restaurante.`;

      // 6. LLAMAR CLAUDE con historial + mensaje actual
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 512,
        system: systemPrompt,
        messages: [
          ...historyMessages,
          { role: 'user', content: message.body },
        ],
      });

      const botResponse =
        response.content[0].type === 'text' ? response.content[0].text : '';

      this.logger.log(`Response generada: ${botResponse}`);

      // 7. ENVIAR A PLAZBOT
      await this.plazbot.sendMessage(apiKey, workspaceId, plazContact.id, botResponse);

      // 8. TAG SI ES CONSULTA DE RESERVA
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
    return keywords.some((kw) => message.toLowerCase().includes(kw));
  }

  private decryptSecret(encrypted: string): string {
    return encrypted;
  }
}
