import { EntityManager } from 'typeorm';

// Medio "sencillo y gratuito" para dejar de recibir promociones (art. 26.5 del Reglamento de la Ley 29733,
// D.S. 016-2024-JUS): basta con escribir BAJA (o STOP) al WhatsApp del local.
const OPT_OUT = /^\s*(baja|stop|darme de baja|no (quiero )?(m[aá]s )?(promociones|mensajes))\s*[.!]*\s*$/i;

export function isOptOutMessage(text: string): boolean {
    return OPT_OUT.test(text ?? '');
}

const lastNine = (phone: string) => phone.replace(/\D/g, '').slice(-9);

/**
 * Retira el consentimiento de marketing de ese teléfono en ese local, en todas las tablas que usan las
 * campañas (fidelización, contactos importados y opiniones con consentimiento). Se compara por los últimos
 * 9 dígitos porque el mismo número se guarda con o sin el prefijo 51.
 */
export async function revokeMarketingConsent(manager: EntityManager, placeId: string, phone: string): Promise<void> {
    const digits = lastNine(phone);
    if (digits.length < 9) return;
    const samePhone = (column: string) => `right(regexp_replace(coalesce(${column}, ''), '\\D', '', 'g'), 9) = $2`;
    await manager.query(`UPDATE wuarike_db.loyalty_cards SET marketing_consent = false WHERE place_id::text = $1 AND ${samePhone('customer_phone')}`, [placeId, digits]);
    await manager.query(`UPDATE wuarike_db.contacts SET marketing_consent = false WHERE place_id::text = $1 AND ${samePhone('phone')}`, [placeId, digits]);
    await manager.query(`UPDATE wuarike_db.public_feedback SET marketing_consent = false WHERE place_id::text = $1 AND ${samePhone('customer_contact')}`, [placeId, digits]);
    // Registro explícito de la baja: lo usan los avisos de rutina de la agenda.
    await manager.query(`INSERT INTO wuarike_db.whatsapp_opt_outs (place_id, phone9) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [placeId, digits]);
}
