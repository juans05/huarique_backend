export const INSIGHT_PRESETS = ['last_7d', 'last_30d', 'this_month', 'last_month'] as const;
export type InsightPreset = (typeof INSIGHT_PRESETS)[number];
/** Conversaciones de WhatsApp/Messenger iniciadas desde el anuncio (ventana de 7 días de Meta). */
export const MESSAGING_ACTION = 'onsite_conversion.messaging_conversation_started_7d';

const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0);
const messages = (actions: any[] | undefined) =>
    num((actions ?? []).find((a) => a?.action_type === MESSAGING_ACTION)?.value);
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Respuestas de /insights → resumen para el panel. `daily`: nivel cuenta por día (gasto); `campaigns`: nivel campaña
 * sin desglose diario (el alcance no se puede sumar entre días); `total`: nivel cuenta del periodo.
 */
export function mapInsights(input: { daily: any[]; campaigns: any[]; total: any; account: { currency?: string; spend_cap?: string; amount_spent?: string } }) {
    const t = input.total ?? {};
    const spend = num(t.spend);
    const msgs = messages(t.actions);
    // spend_cap y amount_spent vienen en centavos de la moneda de la cuenta.
    const cap = num(input.account.spend_cap);
    return {
        currency: input.account.currency ?? null,
        totals: { spend: round(spend), reach: num(t.reach), impressions: num(t.impressions), clicks: num(t.clicks), messages: msgs, costPerMessage: msgs ? round(spend / msgs) : null },
        daily: input.daily.map((d) => ({ date: d.date_start, spend: round(num(d.spend)) })),
        campaigns: input.campaigns
            .map((c) => ({ name: c.campaign_name ?? 'Sin nombre', spend: round(num(c.spend)), reach: num(c.reach), clicks: num(c.clicks), cpc: c.cpc != null ? round(num(c.cpc)) : null, ctr: c.ctr != null ? round(num(c.ctr)) : null, messages: messages(c.actions) }))
            .sort((a, b) => b.spend - a.spend),
        spendCap: cap ? { cap: round(cap / 100), spent: round(num(input.account.amount_spent) / 100) } : null,
    };
}
