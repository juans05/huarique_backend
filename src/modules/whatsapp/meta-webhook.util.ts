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

export interface MetaTemplateAlert {
    wabaId: string;
    templateName: string;
    /** Asunto corto y explicación para el dueño del local. */
    title: string;
    detail: string;
}

const TEMPLATE_STATUS_TEXT: Record<string, { title: string; detail: string }> = {
    APPROVED: { title: 'fue aprobada', detail: 'Ya puedes usarla en tus difusiones.' },
    REJECTED: { title: 'fue rechazada', detail: 'Meta no la aprobó. Revísala y vuelve a crearla con los cambios.' },
    PAUSED: { title: 'fue pausada', detail: 'Meta la pausó porque los clientes la marcaron o bloquearon. Mientras esté pausada no se envía.' },
    DISABLED: { title: 'fue desactivada', detail: 'Meta la desactivó por calidad baja repetida. Crea una nueva con otro texto.' },
    FLAGGED: { title: 'está en riesgo', detail: 'Su calidad bajó. Si no mejora, Meta la desactivará en unos días.' },
};

const QUALITY_TEXT: Record<string, { title: string; detail: string }> = {
    YELLOW: { title: 'bajó a calidad media', detail: 'Algunos clientes la están bloqueando o reportando. Revisa el texto y a quién se la envías.' },
    RED: { title: 'bajó a calidad baja', detail: 'Muchos clientes la bloquean o reportan. Meta podría pausarla pronto.' },
};

/**
 * Avisos de Meta sobre las plantillas del local (campos message_template_status_update y
 * message_template_quality_update). Solo devuelve los que vale la pena contarle al dueño.
 */
export function parseTemplateAlerts(payload: any): MetaTemplateAlert[] {
    const out: MetaTemplateAlert[] = [];
    for (const entry of payload?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
            const value = change?.value;
            const wabaId = entry?.id;
            const templateName = value?.message_template_name;
            if (!wabaId || !templateName) continue;

            let text: { title: string; detail: string } | undefined;
            if (change.field === 'message_template_status_update') {
                text = TEMPLATE_STATUS_TEXT[value.event];
                const reason = value.reason && value.reason !== 'NONE' ? ` Motivo indicado por Meta: ${value.reason}.` : '';
                if (text && value.event === 'REJECTED') text = { ...text, detail: text.detail + reason };
            } else if (change.field === 'message_template_quality_update') {
                text = QUALITY_TEXT[value.new_quality_score];
            }
            if (text) out.push({ wabaId, templateName, ...text });
        }
    }
    return out;
}
