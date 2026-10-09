import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/** Lo mínimo que hace falta de un número para hablar con la API de WhatsApp Cloud. */
export interface CloudNumber {
    phoneNumberId: string;
    whatsappApiToken?: string | null;
}

export type CloudMediaKind = 'image' | 'video' | 'audio' | 'document';

export function mediaKindFromMime(mime: string): CloudMediaKind {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
}

/** Meta espera el teléfono solo con dígitos y código de país, sin "+" ni espacios. */
export function toCloudPhone(phone: string): string {
    return phone.replace(/\D/g, '');
}

export function buildTextPayload(to: string, text: string) {
    return { to: toCloudPhone(to), type: 'text', text: { body: text, preview_url: true } };
}

export function buildMediaPayload(to: string, url: string, mime: string, caption?: string) {
    const kind = mediaKindFromMime(mime);
    // Los audios no admiten caption; los documentos usan "filename" para mostrar un nombre.
    const media: Record<string, string> = { link: url };
    if (caption && kind !== 'audio') media.caption = caption;
    return { to: toCloudPhone(to), type: kind, [kind]: media };
}

/** Parámetros del cuerpo de una plantilla: un texto por cada {{n}}. */
export function buildBodyComponents(values: string[]) {
    return values.length ? [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }] : [];
}

export function buildTemplatePayload(to: string, name: string, language: string, components: unknown[] = []) {
    return { to: toCloudPhone(to), type: 'template', template: { name, language: { code: language }, components } };
}

/**
 * Cliente de la API de WhatsApp Cloud (Meta). Habla directo con graph.facebook.com;
 * reemplaza a PlazBot como canal de salida. El token es el del número (Embedded Signup)
 * o, si no tiene, el del sistema (WHATSAPP_API_TOKEN).
 */
@Injectable()
export class WhatsAppCloudService {
    private readonly logger = new Logger(WhatsAppCloudService.name);

    private get baseUrl() {
        return `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v20.0'}`;
    }

    private async post(number: CloudNumber, body: Record<string, unknown>): Promise<string | null> {
        const token = number.whatsappApiToken || process.env.WHATSAPP_API_TOKEN;
        if (!token) throw new BadGatewayException('WhatsApp no está configurado: falta el token de acceso.');

        try {
            const { data } = await axios.post(
                `${this.baseUrl}/${number.phoneNumberId}/messages`,
                { messaging_product: 'whatsapp', recipient_type: 'individual', ...body },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 },
            );
            return data?.messages?.[0]?.id ?? null;
        } catch (err: any) {
            const detail = err?.response?.data?.error?.message || err?.message;
            this.logger.error(`[WhatsApp Cloud] Falló el envío: ${detail}`);
            throw new BadGatewayException(`No se pudo enviar por WhatsApp: ${detail}`);
        }
    }

    sendText(number: CloudNumber, to: string, text: string) {
        return this.post(number, buildTextPayload(to, text));
    }

    sendMediaByUrl(number: CloudNumber, to: string, url: string, mime: string, caption?: string) {
        return this.post(number, buildMediaPayload(to, url, mime, caption));
    }

    /** Único tipo de mensaje permitido fuera de la ventana de 24 h: una plantilla aprobada. */
    sendTemplate(number: CloudNumber, to: string, name: string, language: string, components: unknown[] = []) {
        return this.post(number, buildTemplatePayload(to, name, language, components));
    }

    /** Marca como leído (doble check azul) un mensaje entrante. No es crítico: si falla, solo se registra. */
    async markAsRead(number: CloudNumber, messageId: string): Promise<void> {
        const token = number.whatsappApiToken || process.env.WHATSAPP_API_TOKEN;
        if (!token) return;
        try {
            await axios.post(
                `${this.baseUrl}/${number.phoneNumberId}/messages`,
                { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
                { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 },
            );
        } catch (err: any) {
            this.logger.warn(`[WhatsApp Cloud] No se pudo marcar como leído: ${err?.response?.data?.error?.message || err?.message}`);
        }
    }
}
