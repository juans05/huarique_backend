import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlazBotService } from '../plazbot/plazbot.service';
import { VectorService } from '../ai/vector.service';
import { MenuFormatterService } from '../places/menu-formatter.service';
import { PlaceBotConfigService } from '../plazbot-config/place-bot-config.service';
import { Conversation } from '../whatsapp/entities/conversation.entity';
import { Message } from '../whatsapp/entities/message.entity';

@Injectable()
export class ChatProcessorService {
  private readonly logger = new Logger(ChatProcessorService.name);
  private anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;
  private grok = process.env.XAI_API_KEY
    ? new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' })
    : null;
  private gemini = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

  constructor(
    private plazbot: PlazBotService,
    private vectorService: VectorService,
    private menuFormatter: MenuFormatterService,
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
      const chunks = await this.vectorService.searchSimilarity(placeId, messageBody, 15);
      this.logger.log(`[RAG] chunks encontrados: ${chunks.length}`);
      this.logger.log(`[RAG] contenido: ${JSON.stringify(chunks)}`);
      if (chunks.length > 0) ragContext = chunks.join('\n\n');
    } catch (err) {
      this.logger.warn('RAG search falló, continuando sin contexto:', err);
    }

    // 5b. Agregar carta digital estructurada si existe
    try {
      const menuMarkdown = await this.menuFormatter.formatMenuToMarkdown(placeId);
      if (menuMarkdown) {
        this.logger.log(`Menú digital disponible: ${menuMarkdown.length} chars`);
        ragContext = ragContext
          ? `${ragContext}\n\n${menuMarkdown}`
          : menuMarkdown;
      } else {
        this.logger.log('Sin carta digital configurada');
      }
    } catch (err) {
      this.logger.warn('Error al obtener carta digital:', err);
    }

    // 6. Construir system prompt
    // identity: construida desde los campos del panel (nombre del bot + restaurante + instrucciones extra)
    const botName = botConfig?.botName || 'el asistente virtual';
    const restaurantName = botConfig?.restaurantName || 'el restaurante';
    const identity = `Eres ${botName}, el asistente virtual del restaurante ${restaurantName}. Atiendes por WhatsApp en español, con un trato amable y cercano como si fueras parte del equipo.`;

    const behaviorRules = `REGLAS BASE (siempre aplica estas reglas):
- Habla como una persona real y cercana, no como un robot.
- Varía cómo empiezas cada respuesta.
- Usa emojis con moderación y solo cuando sean naturales.
- Presenta SIEMPRE lo que sí sabes con confianza. Nunca digas "no tengo el menú completo" ni "mi información es limitada" — simplemente comparte lo que tienes.
- Si el cliente pregunta algo puntual que no encuentras, ofrece conectarlo con el equipo solo si realmente no tienes esa info específica.
- No inventes precios ni datos que no tengas.
- Si el cliente quiere hacer un pedido o reserva, indícale cómo proceder de forma sencilla.
- Respuestas cortas: máximo 3–4 oraciones salvo que el cliente pida detalle.

FORMATO OBLIGATORIO PARA WHATSAPP:
- NUNCA uses ## ni ### — WhatsApp no los renderiza.
- NUNCA uses ** para negrita — usa *texto* en su lugar.
- Para listas usa guiones (–), no asteriscos ni markdown.
- Prefiere texto corrido y natural sobre listas cuando sea posible.`;

    const customRules = botConfig?.systemPrompt
      ? `\nINSTRUCCIONES ADICIONALES DEL RESTAURANTE (tienen prioridad sobre las reglas base):\n${botConfig.systemPrompt}`
      : '';

    const systemPrompt = ragContext
      ? `${identity}\n\n${behaviorRules}${customRules}\n\nINFORMACIÓN DEL RESTAURANTE:\n${ragContext}`
      : `${identity}\n\n${behaviorRules}${customRules}`;

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

    // 8. Llamar a Claude o Grok según disponibilidad
    let botResponse = '';

    if (this.anthropic) {
      this.logger.log(`[${placeId}] Usando Claude`);
      const claudeResponse = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: [...historyMessages, { role: 'user', content: messageBody }],
      });
      botResponse = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : '';
    } else if (this.grok) {
      this.logger.log(`[${placeId}] Claude no disponible, usando Grok`);
      const grokMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content as string })),
        { role: 'user', content: messageBody },
      ];
      const grokResponse = await this.grok.chat.completions.create({
        model: 'grok-3',
        max_tokens: 512,
        messages: grokMessages,
      });
      botResponse = grokResponse.choices[0]?.message?.content || '';
    } else if (this.gemini) {
      this.logger.log(`[${placeId}] Claude y Grok no disponibles, usando Gemini`);
      const model = this.gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const history = historyMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content as string }],
      }));
      const chat = model.startChat({
        history,
        systemInstruction: systemPrompt,
      });
      const result = await chat.sendMessage(messageBody);
      botResponse = result.response.text();
    } else {
      this.logger.error(`[${placeId}] No hay API key configurada (ANTHROPIC_API_KEY, XAI_API_KEY o GEMINI_API_KEY)`);
      return { success: false };
    }

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
