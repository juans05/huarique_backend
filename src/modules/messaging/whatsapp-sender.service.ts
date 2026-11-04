import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { Place } from '../places/entities/place.entity';
import { isMetaEnabled } from './meta-flag';
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import type { MessageSource } from './whatsapp-billing.service';

/**
 * Punto único para enviar por WhatsApp: todo sale por la API de WhatsApp Cloud (Facebook).
 * Un número que no está conectado con Facebook, o un local con el canal apagado, no envía.
 */
@Injectable()
export class WhatsAppSenderService {
    constructor(
        @InjectRepository(WhatsAppNumber)
        private readonly numbers: Repository<WhatsAppNumber>,
        @InjectRepository(Place)
        private readonly places: Repository<Place>,
        private readonly cloud: WhatsAppCloudService,
    ) {}

    private async metaNumber(whatsappNumberId: string | null): Promise<WhatsAppNumber> {
        const number = whatsappNumberId ? await this.numbers.findOne({ where: { id: whatsappNumberId } }) : null;
        const place = number ? await this.places.findOne({ where: { id: number.placeId } }) : null;
        if (!number || number.provider !== 'meta' || !number.isActive || !isMetaEnabled(place)) {
            throw new BadRequestException('Este número de WhatsApp no está conectado con Facebook.');
        }
        return number;
    }

    async sendText(whatsappNumberId: string | null, to: string, text: string, source: MessageSource = 'bot'): Promise<void> {
        const meta = await this.metaNumber(whatsappNumberId);
        await this.cloud.sendText(meta, to, text, source);
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
        await this.cloud.sendMediaByUrl(meta, to, url, mime, caption);
    }

    /** Archivo que subió un operador desde el panel: Meta lo toma por URL (ya subido a Cloudinary). */
    async sendOperatorFile(
        whatsappNumberId: string | null,
        to: string,
        customerName: string | undefined,
        file: Express.Multer.File,
        uploadedUrl: string,
        caption?: string,
    ): Promise<void> {
        const meta = await this.metaNumber(whatsappNumberId);
        await this.cloud.sendMediaByUrl(meta, to, uploadedUrl, file.mimetype, caption, 'agent');
    }
}
