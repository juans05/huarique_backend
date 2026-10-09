export type SegmentType = 'all' | 'loyalty' | 'inactive' | 'normal' | 'excel';
export const LOYALTY_LEVELS = ['BRONCE', 'PLATA', 'ORO', 'VIP'] as const;
export type LoyaltyLevel = (typeof LOYALTY_LEVELS)[number];

export interface SegmentFilter {
    type?: string;
    /** Solo para "loyalty": niveles elegidos (vacío = todos los niveles). */
    levels?: string[];
    /** Solo para "inactive": días sin visitar (por defecto 30). */
    days?: number;
}

export interface Recipient {
    phone?: string | null;
    name?: string | null;
    contactId?: string | null;
}

export interface CardHolder {
    customerPhone: string;
    customerName?: string | null;
    level?: string | null;
    marketingConsent?: boolean | null;
    lastVisitAt?: Date | null;
    createdAt?: Date | null;
}

const digits = (p?: string | null) => (p ?? '').replace(/\D/g, '');
const DAY = 24 * 3600 * 1000;

export function inactiveDays(filter?: SegmentFilter): number {
    const d = Number(filter?.days);
    return Number.isFinite(d) && d >= 1 ? Math.min(Math.floor(d), 365) : 30;
}

const asRecipient = (c: CardHolder): Recipient => ({ phone: c.customerPhone, name: c.customerName ?? null, contactId: null });

/**
 * Segmentos de una campaña (flujo Meta):
 * - all:      la lista base (quienes escribieron, o la lista de Excel elegida).
 * - excel:    la lista de Excel elegida (la base ya es esa lista).
 * - loyalty:  clientes con tarjeta de fidelización, por nivel (Bronce/Plata/Oro/VIP). SOLO quienes aceptaron promociones.
 * - inactive: clientes con tarjeta que no visitan hace N días (30 por defecto). SOLO quienes aceptaron promociones.
 * - normal:   de la lista base, quienes NO tienen tarjeta.
 * El consentimiento se registra al unirse a la fidelización: sin él no se les escribe.
 */
export function segmentRecipients(filter: SegmentFilter | undefined, base: Recipient[], cards: CardHolder[], now: Date = new Date()): Recipient[] {
    const type = filter?.type ?? 'all';
    if (type === 'all' || type === 'excel') return base;

    if (type === 'normal') {
        const holders = new Set(cards.map((c) => digits(c.customerPhone)));
        return base.filter((r) => !holders.has(digits(r.phone)));
    }

    const consented = cards.filter((c) => c.marketingConsent === true);

    if (type === 'loyalty') {
        const levels = (filter?.levels ?? []).filter((l): l is LoyaltyLevel => (LOYALTY_LEVELS as readonly string[]).includes(l));
        return consented.filter((c) => levels.length === 0 || levels.includes(c.level as LoyaltyLevel)).map(asRecipient);
    }

    if (type === 'inactive') {
        const limit = now.getTime() - inactiveDays(filter) * DAY;
        return consented
            .filter((c) => {
                // Sin visita registrada se mide desde que se creó la tarjeta.
                const last = c.lastVisitAt ?? c.createdAt;
                return !!last && new Date(last).getTime() < limit;
            })
            .map(asRecipient);
    }

    throw new Error(`Segmento no soportado: ${type}`);
}
