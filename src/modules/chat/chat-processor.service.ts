import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Anthropic } from '@anthropic-ai/sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlazBotService } from '../plazbot/plazbot.service';
import { VectorService } from '../ai/vector.service';
import { PlaceBotConfigService } from '../plazbot-config/place-bot-config.service';
import { Conversation } from '../whatsapp/entities/conversation.entity';
import { Message } from '../whatsapp/entities/message.entity';

@Injectable()
export class ChatProcessorService {
  private readonly logger = new Logger(ChatProcessorService.name);
  private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(
    private plazbot: PlazBotService,
    private vectorService: VectorService,
    private botConfigService: PlaceBotConfigService,
    private eventEmitter: EventEmitter2,
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
  ) {}

  async processIncomingMessage(
    placeId: string,
    contact: { name: string; phone: string },
    messageBody: string,
  ) {
    this.logger.log(`[${placeId}] ${contact.name}: "${messageBody}"`);

    // Credenciales globales de PlazBot — son de wuarikes, no del restaurante
    const apiKey = process.env.PLAZBOT_API_KEY!;
    const workspaceId = process.env.PLAZBOT_WORKSPACE_ID!;

    // 1. Buscar o crear conversación en wuarikes DB
    let conversation = await this.conversationRepo.findOne({
      where: { placeId, customerPhone: contact.phone },
    });
    if (!conversation) {
      conversation = this.conversationRepo.create({
        placeId,
        customerPhone: contact.phone,
        customerName: contact.name,
        mode: 'bot',
      });
      await this.conversationRepo.save(conversation);
    }

    // 2. Registrar mensaje entrante
    await this.messageRepo.save(
      this.messageRepo.create({
        conversationId: conversation.id,
        messageType: 'INCOMING',
        messageBody,
      }),
    );

    // Emitir evento SSE para actualizar el frontend en tiempo real
    this.eventEmitter.emit('whatsapp.message.received', {
      placeId,
      conversationId: conversation.id,
      customerName: conversation.customerName,
      customerPhone: conversation.customerPhone,
      messageBody,
    });

    // 3. Si está en modo humano, el agente responde manualmente — no procesar
    if (conversation.mode === 'human') {
      this.logger.log(`Conversación ${conversation.id} en modo humano, ignorando`);
      return { success: true };
    }

    // 4. Configuración del bot para este restaurante
    const botConfig = await this.botConfigService.findByPlaceId(placeId);

    // 5. RAG: buscar contexto relevante de la knowledge base
    let ragContext = '';
    try {
      const chunks = await this.vectorService.searchSimilarity(placeId, messageBody, 5);
      if (chunks.length > 0) ragContext = chunks.join('\n\n');
    } catch (err) {
      this.logger.warn('RAG search falló, continuando sin contexto:', err);
    }

    // 6. Construir system prompt
    const basePrompt =
      botConfig?.systemPrompt ||
      'Eres un asistente inteligente para un restaurante. Responde siempre en español, de manera amable y profesional.';

    const systemPrompt = ragContext
      ? `${basePrompt}\n\nINFORMACIÓN DEL RESTAURANTE:\n${ragContext}\n\nUsa únicamente la información anterior para responder. Si no encuentras la respuesta, ofrece conectar con el staff del restaurante.`
      : `${basePrompt}\n\nSi no sabes algo, ofrece conectar con el staff del restaurante.`;

    // 7. Historial de conversación desde wuarikes DB (últimos 20 mensajes)
    const recentMessages = await this.messageRepo.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'DESC' },
      take: 21, // 21 para poder excluir el que acabamos de guardar
    });

    const historyMessages: Anthropic.MessageParam[] = recentMessages
      .reverse()
      .slice(0, -1) // excluir el mensaje entrante recién guardado
      .map((m) => ({
        role: (m.messageType === 'INCOMING' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.messageBody,
      }))
      .reduce((acc: Anthropic.MessageParam[], curr) => {
        if (acc.length > 0 && acc[acc.length - 1].role === curr.role) return acc;
        acc.push(curr);
        return acc;
      }, []);

    // 8. Llamar a Claude con historial + mensaje actual
    const claudeResponse = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 512,
      system: systemPrompt,
      messages: [...historyMessages, { role: 'user', content: messageBody }],
    });

    const botResponse =
      claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : '';

    this.logger.log(`Respuesta generada: ${botResponse}`);

    // 9. Registrar respuesta del bot en wuarikes DB
    await this.messageRepo.save(
      this.messageRepo.create({
        conversationId: conversation.id,
        messageType: 'OUTGOING',
        messageBody: botResponse,
        isFromAi: true,
      }),
    );

    // 10. Enviar respuesta via PlazBot
    await this.plazbot.sendMessage(apiKey, workspaceId, contact.phone, botResponse);

    return { success: true };
  }
}
