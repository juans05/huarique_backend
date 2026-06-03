import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { AiService } from '../ai/ai.service';
import { VectorService } from '../ai/vector.service';
import { MenuFormatterService } from '../places/menu-formatter.service';
import axios from 'axios';

@Injectable()
export class WhatsappService {
    constructor(
        @InjectRepository(WhatsAppNumber)
        private whatsappNumberRepo: Repository<WhatsAppNumber>,
        @InjectRepository(Conversation)
        private conversationRepo: Repository<Conversation>,
        @InjectRepository(Message)
        private messageRepo: Repository<Message>,
        private aiService: AiService,
        private vectorService: VectorService,
        private menuFormatter: MenuFormatterService,
        private eventEmitter: EventEmitter2
    ) {}

    async processWebhookPayload(payload: any) {
        const entry = payload.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const metadata = value?.metadata;
        const incomingMsg = value?.messages?.[0];

        if (!incomingMsg || !metadata) return;

        const phoneId = metadata.phone_number_id;
        const customerPhone = incomingMsg.from;
        const messageBody = incomingMsg.text?.body;
        const whatsappMsgId = incomingMsg.id;
        const customerName = value.contacts?.[0]?.profile?.name || 'Comensal';

        if (!messageBody) return;

        // 1. Fetch WhatsApp credentials associated with this place
        const waNumberObj = await this.whatsappNumberRepo.findOne({
            where: { phoneNumberId: phoneId, isActive: true },
            relations: ['place']
        });

        if (!waNumberObj) {
            console.warn(`[WhatsApp Webhook] Unrecognized phone number ID: ${phoneId}`);
            return;
        }

        // 2. Fetch or create a conversation thread for the customer
        let conversation = await this.conversationRepo.findOne({
            where: { placeId: waNumberObj.placeId, customerPhone }
        });

        if (!conversation) {
            conversation = this.conversationRepo.create({
                placeId: waNumberObj.placeId,
                customerPhone,
                customerName
            });
            await this.conversationRepo.save(conversation);
        }

        // 3. Log incoming message
        const incomingLog = this.messageRepo.create({
            conversationId: conversation.id,
            messageType: 'INCOMING',
            messageBody,
            whatsappMessageId: whatsappMsgId
        });
        await this.messageRepo.save(incomingLog);

        // 4. Emit event for real-time updates (SSE)
        this.eventEmitter.emit('whatsapp.message.received', {
            placeId: waNumberObj.placeId,
            conversationId: conversation.id,
            customerName: conversation.customerName,
            customerPhone: conversation.customerPhone,
            messageBody
        });

        // 5. Generate chatbot response (only if in bot mode)
        if (conversation.mode === 'bot') {
            await this.generateAndSendBotResponse(conversation, messageBody, waNumberObj);
        }
    }

    private async generateAndSendBotResponse(conversation: Conversation, userMsg: string, waNumber: WhatsAppNumber) {
        let systemPrompt = '';

        try {
            // Retrieve contextual chunks from the vector database (RAG)
            const contextChunks = await this.vectorService.searchSimilarity(conversation.placeId, userMsg, 3);
            let contextText = contextChunks.join('\n');
            console.log(`[WhatsApp] RAG: ${contextChunks.length} chunks, ${contextText.length} chars`);

            // Append structured digital menu if available
            const menuMarkdown = await this.menuFormatter.formatMenuToMarkdown(conversation.placeId);
            if (menuMarkdown) {
                console.log(`[WhatsApp] Menú digital disponible: ${menuMarkdown.length} chars`);
                contextText = contextText
                    ? `${contextText}\n\n${menuMarkdown}`
                    : menuMarkdown;
            } else {
                console.log(`[WhatsApp] Sin carta digital configurada`);
            }

            if (contextText.trim().length > 0) {
                systemPrompt = `
Eres el asistente virtual con Inteligencia Artificial del restaurante "${waNumber.place.name}". 
Responde de manera concisa, amable y servicial al comensal en español.
Básate ÚNICAMENTE en la información provista a continuación (la carta, horarios, FAQs):

INFORMACIÓN DEL RESTAURANTE:
${contextText}

Instrucciones:
1. Responde de forma resumida (menos de 150 caracteres para caber en un mensaje de WhatsApp).
2. Si la información solicitada no está descrita arriba, responde amablemente diciendo que no posees ese detalle y que un operador humano se contactará pronto.
`;
            } else {
                // Fallback prompt when no RAG knowledge base is set up yet
                systemPrompt = `Eres el asistente virtual del restaurante "${waNumber.place.name}". Responde de forma amable, servicial y muy breve (menos de 150 caracteres). Si te preguntan por reservas o detalles específicos, indica que pronto un agente humano le atenderá.`;
            }
        } catch (error) {
            console.error('[WhatsApp Service] RAG/menu fetch failed, falling back to simple AI', error);
            systemPrompt = `Eres el asistente virtual del restaurante "${waNumber.place.name}". Responde de forma amable, servicial y muy breve.`;
        }

        const aiReply = await this.aiService.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMsg }
        ]);

        // 5. Log outgoing message
        const outgoingLog = this.messageRepo.create({
            conversationId: conversation.id,
            messageType: 'OUTGOING',
            messageBody: aiReply,
            isFromAi: true
        });
        await this.messageRepo.save(outgoingLog);

        // 6. Dispatch message to Meta API
        await this.sendWhatsAppMessage(
            waNumber.phoneNumberId,
            waNumber.whatsappApiToken,
            conversation.customerPhone,
            aiReply
        );
    }

    async sendWhatsAppMessage(phoneId: string, token: string, to: string, text: string) {
        const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
        await axios.post(
            url,
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'text',
                text: { body: text }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    }
}
