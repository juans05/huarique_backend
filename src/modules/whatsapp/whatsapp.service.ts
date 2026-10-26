import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { ChatProcessorService } from '../chat/chat-processor.service';
import { WhatsAppCloudService } from '../messaging/whatsapp-cloud.service';
import { parseMetaWebhook, parseTemplateAlerts } from './meta-webhook.util';
import { MailService } from '../../common/services/mail.service';
import { isMetaEnabled } from '../messaging/meta-flag';
import { WhatsAppBillingService } from '../messaging/whatsapp-billing.service';

@Injectable()
export class WhatsappService {
    private readonly logger = new Logger(WhatsappService.name);

    constructor(
        @InjectRepository(WhatsAppNumber)
        private whatsappNumberRepo: Repository<WhatsAppNumber>,
        private chatProcessor: ChatProcessorService,
        private cloud: WhatsAppCloudService,
        private mail: MailService,
        private billing: WhatsAppBillingService,
    ) {}

    /**
     * Mensajes que llegan directo desde la API de WhatsApp Cloud (Meta). Pasan por el mismo
     * agente que usaba PlazBot (carta, base de conocimiento, menú de botones, modo humano).
     */
    async processWebhookPayload(payload: any) {
        await this.notifyTemplateAlerts(payload);
        // Estados de entrega: categoría y costo de cada mensaje, y aviso si Meta no entrega por falta de pago.
        await this.billing.applyStatuses(payload);
        for (const msg of parseMetaWebhook(payload)) {
            const number = await this.whatsappNumberRepo.findOne({
                where: { phoneNumberId: msg.phoneNumberId, isActive: true },
                relations: ['place'],
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
            if (!isMetaEnabled(number.place)) {
                this.logger.warn(`Número ${number.phoneNumber}: el local no activó el canal de Facebook, se ignora`);
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

    /** Correo al dueño del local cuando Meta aprueba, rechaza o baja de calidad una de sus plantillas. */
    private async notifyTemplateAlerts(payload: any) {
        for (const alert of parseTemplateAlerts(payload)) {
            // Una cuenta de WhatsApp (WABA) puede tener varios números del mismo local: un correo por local.
            const numbers = await this.whatsappNumberRepo.find({
                where: { wabaId: alert.wabaId, provider: 'meta' },
                relations: ['place', 'place.claimedBy'],
            });
            const places = new Map(numbers.filter(n => n.place?.claimedBy?.email).map(n => [n.placeId, n.place]));
            for (const place of places.values()) {
                await this.mail
                    .sendTemplateAlert(place.claimedBy.email, place.name ?? 'tu local', alert.templateName, alert.title, alert.detail)
                    .catch(err => this.logger.warn(`No se pudo avisar la plantilla ${alert.templateName} a ${place.name}: ${err?.message}`));
            }
        }
    }

    /** Envío de texto directo por Meta (lo usan difusiones y fidelización). */
    async sendWhatsAppMessage(phoneId: string, token: string, to: string, text: string) {
        await this.cloud.sendText({ phoneNumberId: phoneId, whatsappApiToken: token }, to, text);
    }
}
