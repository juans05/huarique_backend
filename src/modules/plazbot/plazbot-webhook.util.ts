import * as crypto from 'crypto';

// PlazBot no firma sus webhooks ni deja enviar cabeceras propias: el secreto viaja en la URL
// (?secret=...). Sin esto, cualquiera podría fingir mensajes de clientes y gastar llamadas a la IA.
export function plazbotWebhookUrl(): string {
    const base = process.env.BACKEND_URL || 'https://backendwarike-production.up.railway.app';
    const secret = process.env.PLAZBOT_WEBHOOK_SECRET;
    return `${base}/api/webhooks/plazbot${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`;
}

/**
 * true si la llamada trae el secreto correcto.
 * Sin PLAZBOT_WEBHOOK_SECRET configurado se rechaza todo: si no, cualquiera podría inyectar
 * mensajes falsos de clientes, dar de baja su marketing y gastar llamadas a la IA.
 */
export function isValidPlazbotSecret(provided: string | undefined, secret = process.env.PLAZBOT_WEBHOOK_SECRET): boolean {
    if (!secret) return false;
    if (!provided || provided.length !== secret.length) return false;
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}
