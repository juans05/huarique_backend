import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { Place } from '../places/entities/place.entity';
import { isMetaEnabled } from './meta-flag';
import { PlazBotService } from '../plazbot/plazbot.service';
import { WhatsAppCloudService } from './whatsapp-cloud.service';

/**
 * Punto único para enviar por WhatsApp. Cada número elige su proveedor ('meta' = API de
 * WhatsApp Cloud, 'plazbot' = el CRM actual), así la migración es número por número y
 * se puede cortar PlazBot cuando todos estén en Meta. Sin número asociado → PlazBot (legado).
 */
@Injectable()
export class WhatsAppSenderService {
    constructor(
        @InjectRepository(WhatsAppNumber)
        private readonly numbers: Repository<WhatsAppNumber>,
        @InjectRepository(Place)
        private readonly places: Repository<Place>,
        private readonly plazbot: PlazBotService,
        private readonly cloud: WhatsAppCloudService,
    ) {}

    private async metaNumber(whatsappNumberId: string | null): Promise<WhatsAppNumber | null> {
        if (!whatsappNumberId) return null;
        const number = await this.numbers.findOne({ where: { id: whatsappNumberId } });
        if (number?.provider !== 'meta' || !number.isActive) return null;
        // Sin el flag del local no se usa Meta aunque el número esté marcado: todo sigue por PlazBot.
        const place = await this.places.findOne({ where: { id: number.placeId } });
        return isMetaEnabled(place) ? number : null;
    }

    private get plazbotAuth() {
        return { apiKey: process.env.PLAZBOT_API_KEY || '', workspaceId: process.env.PLAZBOT_WORKSPACE_ID || '' };
    }

    async sendText(whatsappNumberId: string | null, to: string, text: string): Promise<void> {
        const meta = await this.metaNumber(whatsappNumberId);
        if (meta) {
            await this.cloud.sendText(meta, to, text);
            return;
        }
        const { apiKey, workspaceId } = this.plazbotAuth;
        await this.plazbot.sendMessage(apiKey, workspaceId, to, text);
    }

    /** Archivo ya alojado (URL pública): lo usa el menú del bot y las difusiones. */
    async sendFileByUrl(
        whatsappNumberId: string | null,
        to: string,
        customerName: string | undefined,
        url: string,
        mime: string,
        caption?: string,
    ): Promise<void> {
        const meta = await this.metaNumber(whatsappNumberId);
        if (meta) {
            await this.cloud.sendMediaByUrl(meta, to, url, mime, caption);
            return;
        }
        const { apiKey, workspaceId } = this.plazbotAuth;
        const contactId = await this.plazbot.resolveContactId(apiKey, workspaceId, to, customerName);
        await this.plazbot.sendFileByUrl(apiKey, workspaceId, contactId, to, url, caption);
    }

    /** Archivo que subió un operador desde el panel: Meta lo toma por URL (ya subido a Cloudinary); PlazBot, como archivo. */
    async sendOperatorFile(
        whatsappNumberId: string | null,
        to: string,
        customerName: string | undefined,
        file: Express.Multer.File,
        uploadedUrl: string,
        caption?: string,
    ): Promise<void> {
        const meta = await this.metaNumber(whatsappNumberId);
        if (meta) {
            await this.cloud.sendMediaByUrl(meta, to, uploadedUrl, file.mimetype, caption);
            return;
        }
        const { apiKey, workspaceId } = this.plazbotAuth;
        const contactId = await this.plazbot.resolveContactId(apiKey, workspaceId, to, customerName);
        await this.plazbot.sendFile(apiKey, workspaceId, contactId, to, file, caption);
    }
}
