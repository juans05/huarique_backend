import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { ChatProcessorService } from '../chat/chat-processor.service';
import { WhatsAppCloudService } from '../messaging/whatsapp-cloud.service';
import { parseMetaWebhook } from './meta-webhook.util';

@Injectable()
export class WhatsappService {
    private readonly logger = new Logger(WhatsappService.name);

    constructor(
        @InjectRepository(WhatsAppNumber)
        private whatsappNumberRepo: Repository<WhatsAppNumber>,
        private chatProcessor: ChatProcessorService,
        private cloud: WhatsAppCloudService,
    ) {}

    /**
     * Mensajes que llegan directo desde la API de WhatsApp Cloud (Meta). Pasan por el mismo
     * agente que usaba PlazBot (carta, base de conocimiento, menú de botones, modo humano).
     */
    async processWebhookPayload(payload: any) {
        for (const msg of parseMetaWebhook(payload)) {
            const number = await this.whatsappNumberRepo.findOne({
                where: { phoneNumberId: msg.phoneNumberId, isActive: true },
            });
            if (!number) {
                this.logger.warn(`Número desconocido (phone_number_id=${msg.phoneNumberId})`);
                continue;
            }
            // Un número que todavía entrega PlazBot no debe responderse también por acá (doble respuesta).
            if (number.provider !== 'meta') {
                this.logger.warn(`Número ${number.phoneNumber} llegó por Meta pero su proveedor es "${number.provider}", se ignora`);
                continue;
            }
            if (msg.body == null) {
                this.logger.log(`Mensaje ${msg.messageId} de tipo "${msg.type}" aún no soportado, se ignora`);
                continue;
            }

            // Doble check azul para el cliente; no es crítico.
            this.cloud.markAsRead(number, msg.messageId).catch(() => undefined);

            await this.chatProcessor.processIncomingMessage(
                number.placeId,
                number.id,
                { name: msg.name, phone: msg.from },
                msg.body,
                msg.messageId,
            );
        }
    }

    /** Envío de texto directo por Meta (lo usan difusiones y fidelización). */
    async sendWhatsAppMessage(phoneId: string, token: string, to: string, text: string) {
        await this.cloud.sendText({ phoneNumberId: phoneId, whatsappApiToken: token }, to, text);
    }
}
