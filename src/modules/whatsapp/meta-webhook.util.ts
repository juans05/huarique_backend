import * as crypto from 'crypto';

export interface MetaIncomingMessage {
    phoneNumberId: string;
    from: string;
    name: string;
    messageId: string;
    /** Texto que el agente debe contestar; null si el tipo de mensaje aún no se soporta (imagen, audio…). */
    body: string | null;
    type: string;
}

/**
 * Meta firma cada webhook con HMAC-SHA256 del cuerpo crudo usando el App Secret
 * (cabecera X-Hub-Signature-256: "sha256=<hex>"). Sin esto, cualquiera podría fingir mensajes.
 */
export function verifyMetaSignature(rawBody: Buffer | undefined, header: string | undefined, appSecret: string): boolean {
    if (!rawBody || !header) return false;
    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const provided = header.replace(/^sha256=/, '');
    return provided.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

/** Aplana el payload de Meta (entry → changes → value → messages) a una lista simple. Ignora estados de entrega. */
export function parseMetaWebhook(payload: any): MetaIncomingMessage[] {
    const out: MetaIncomingMessage[] = [];
    for (const entry of payload?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
            const value = change?.value;
            const phoneNumberId = value?.metadata?.phone_number_id;
            if (!phoneNumberId) continue;

            for (const msg of value?.messages ?? []) {
                if (!msg?.id || !msg?.from) continue;
                const contact = (value.contacts ?? []).find((c: any) => c?.wa_id === msg.from) ?? value.contacts?.[0];
                const body =
                    msg.text?.body ??
                    msg.button?.text ??
                    msg.interactive?.button_reply?.title ??
                    msg.interactive?.list_reply?.title ??
                    null;
                out.push({
                    phoneNumberId,
                    from: msg.from,
                    name: contact?.profile?.name || 'Cliente',
                    messageId: msg.id,
                    body,
                    type: msg.type || 'unknown',
                });
            }
        }
    }
    return out;
}
