// Cómo cobra Meta WhatsApp (vigente desde el 1-oct-2026): por mensaje ENTREGADO, según la categoría y el mercado del
// destinatario (su código de país). Ver https://developers.facebook.com/docs/whatsapp/pricing

/** Respuestas libres (service) gratis por número y por mes; desde la 1.001 se cobran. */
export const FREE_SERVICE_PER_MONTH = 1000;
/** Error de Meta cuando la cuenta no tiene método de pago ("Business eligibility payment issue"). */
export const PAYMENT_ERROR_CODE = 131042;

// "Rest of Latin America" en el rate card (los +1 del Caribe van por código de área).
const LATAM = ['591', '506', '593', '503', '502', '509', '504', '505', '507', '595', '598', '58'];
const LATAM_NANP = ['1809', '1829', '1849', '1658', '1876', '1787', '1939'];
// Mercados con tarifa propia: no son "Other". Sin tarifa cargada, su costo queda sin calcular.
const STANDALONE: Record<string, string> = {
    '54': 'AR', '880': 'BD', '55': 'BR', '56': 'CL', '57': 'CO', '20': 'EG', '33': 'FR', '49': 'DE', '852': 'HK', '36': 'HU',
    '91': 'IN', '62': 'ID', '972': 'IL', '964': 'IQ', '39': 'IT', '7': 'RU', '965': 'KW', '60': 'MY', '52': 'MX', '212': 'MA',
    '977': 'NP', '31': 'NL', '234': 'NG', '968': 'OM', '92': 'PK', '51': 'PE', '48': 'PL', '974': 'QA', '40': 'RO', '966': 'SA',
    '65': 'SG', '94': 'LK', '27': 'ZA', '34': 'ES', '90': 'TR', '380': 'UA', '971': 'AE', '44': 'GB',
};

/** Mercado del rate card según el teléfono del destinatario (solo dígitos, con código de país). */
export function marketOf(phone: string): string {
    const d = (phone ?? '').replace(/\D/g, '');
    if (d.startsWith('1')) return LATAM_NANP.some((p) => d.startsWith(p)) ? 'LATAM' : 'NA';
    for (const len of [3, 2, 1]) {
        const code = d.slice(0, len);
        if (STANDALONE[code]) return STANDALONE[code];
        if (LATAM.includes(code)) return 'LATAM';
    }
    return 'OTHER';
}

export interface MetaStatus {
    wamid: string;
    status: string;
    recipient: string;
    timestamp: Date;
    pricing: { billable: boolean; category: string | null; type: string | null; subtype: string | null } | null;
    errorCodes: number[];
}

/** Estados de entrega del webhook (entry → changes → value → statuses). */
export function parseStatuses(payload: any): MetaStatus[] {
    const out: MetaStatus[] = [];
    for (const entry of payload?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
            for (const s of change?.value?.statuses ?? []) {
                if (!s?.id || !s?.status) continue;
                const p = s.pricing;
                out.push({
                    wamid: s.id,
                    status: s.status,
                    recipient: String(s.recipient_id ?? ''),
                    timestamp: s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date(),
                    pricing: p ? { billable: p.billable === true, category: p.category ?? null, type: p.type ?? null, subtype: p.subtype ?? null } : null,
                    errorCodes: (s.errors ?? []).map((e: any) => Number(e?.code)).filter(Number.isFinite),
                });
            }
        }
    }
    return out;
}

export interface Rate { market: string; category: string; currency: string; rate: number; validFrom: string }

/** Costo estimado con la tarifa de lista vigente ese día; null si no hay tarifa para ese mercado, categoría y moneda. */
export function estimateCost(rates: Rate[], q: { market: string; category: string | null; currency: string | null; billable: boolean; day: string }): number | null {
    if (!q.billable) return 0;
    if (!q.category || !q.currency) return null;
    const match = rates
        .filter((r) => r.market === q.market && r.category === q.category && r.currency === q.currency && r.validFrom <= q.day)
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
    return match ? match.rate : null;
}

/** Proyección a fin de mes: promedio diario de lo que va del mes × días del mes. */
export function projectMonth(spent: number, day: number, daysInMonth: number): number {
    return day > 0 ? Math.round((spent / day) * daysInMonth * 100) / 100 : 0;
}
