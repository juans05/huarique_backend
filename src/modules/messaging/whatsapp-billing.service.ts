import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import axios from 'axios';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { FREE_SERVICE_PER_MONTH, PAYMENT_ERROR_CODE, estimateCost, marketOf, parseStatuses, projectMonth, type Rate } from './whatsapp-pricing.util';

export type MessageSource = 'reminder' | 'recall' | 'broadcast' | 'bot' | 'agent' | 'ready';
/** Lo que hace falta del número que envía para atribuir el costo (un WhatsAppNumber lo cumple). */
export interface BilledNumber { phoneNumberId: string; placeId?: string; wabaId?: string | null; whatsappApiToken?: string | null }
export type BillingStatus = { status: 'OK' | 'SIN_PAGO'; at: string } | null;

/** WABA de Wuarikes: lo que sale de ahí lo paga Wuarikes, no el local. */
const WUARIKES_WABA = () => process.env.WUARIKES_WABA_ID || '1036831432246105';
const graph = () => `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v20.0'}`;
// Lima es UTC-5 todo el año.
const limaDay = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
const limaStart = (day: string) => new Date(`${day}T00:00:00-05:00`);
const monthBounds = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
    return { from: limaStart(`${month}-01`), to: limaStart(next), days: new Date(Date.UTC(y, m, 0)).getUTCDate() };
};

/** ¿Hoy (Lima) ya falló un envío por falta de método de pago? Entonces no se reintentan plantillas hasta mañana. */
export function paymentBlockedToday(billing: BillingStatus | undefined, now = new Date()): boolean {
    return billing?.status === 'SIN_PAGO' && limaDay(new Date(billing.at)) === limaDay(now);
}

/**
 * Consumo de WhatsApp por local. Meta cobra cada mensaje entregado al WABA del número que lo envía: los locales
 * conectados con Embedded Signup le pagan a Meta con su propio método de pago; Wuarikes solo registra y muestra.
 */
@Injectable()
export class WhatsAppBillingService {
    private readonly logger = new Logger(WhatsAppBillingService.name);
    private rates: { at: number; list: Rate[] } | null = null;

    constructor(private dataSource: DataSource, @InjectRepository(WhatsAppNumber) private numbers: Repository<WhatsAppNumber>) { }

    /** Mensaje saliente aceptado por Meta. Nunca rompe el envío: si falla, solo se registra en el log. */
    async recordSent(number: BilledNumber, to: string, wamid: string | null, source: MessageSource) {
        if (!wamid || !number.placeId) return;
        await this.dataSource.query(
            `INSERT INTO wuarike_db.whatsapp_message_costs (wamid, place_id, phone_number_id, waba_id, source, recipient_market)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (wamid) DO NOTHING`,
            [wamid, number.placeId, number.phoneNumberId, number.wabaId ?? null, source, marketOf(to)],
        ).catch((err) => this.logger.warn(`No se registró el costo del mensaje ${wamid}: ${(err as Error).message}`));
    }

    /** Estados del webhook: al entregarse, categoría y costo; si falla por pago, el local queda SIN_PAGO. */
    async applyStatuses(payload: any) {
        for (const s of parseStatuses(payload)) {
            try {
                if (s.errorCodes.includes(PAYMENT_ERROR_CODE)) {
                    const [row] = await this.dataSource.query(`SELECT place_id FROM wuarike_db.whatsapp_message_costs WHERE wamid = $1`, [s.wamid]);
                    if (row) await this.setBilling(row.place_id, 'SIN_PAGO');
                    this.logger.warn(`Mensaje ${s.wamid} no entregado: la cuenta de WhatsApp no tiene método de pago`);
                    continue;
                }
                if ((s.status !== 'delivered' && s.status !== 'read') || !s.pricing) continue;
                const [row] = await this.dataSource.query(
                    `SELECT c.place_id, c.recipient_market, n.billing_currency, n.waba_id, n.id AS number_id
                     FROM wuarike_db.whatsapp_message_costs c
                     LEFT JOIN wuarike_db.whatsapp_numbers n ON n.phone_number_id = c.phone_number_id AND n.is_active
                     WHERE c.wamid = $1 AND c.delivered_at IS NULL`,
                    [s.wamid],
                );
                if (!row) continue;
                const currency = row.billing_currency ?? (await this.fetchCurrency(row));
                const market = row.recipient_market ?? marketOf(s.recipient);
                const cost = estimateCost(await this.rateList(), { market, category: s.pricing.category, currency, billable: s.pricing.billable, day: limaDay(s.timestamp) });
                await this.dataSource.query(
                    `UPDATE wuarike_db.whatsapp_message_costs SET category = $2, pricing_type = $3, pricing_subtype = $4, billable = $5,
                       delivered_at = $6, recipient_market = $7, est_cost = $8, currency = $9
                     WHERE wamid = $1 AND delivered_at IS NULL`,
                    [s.wamid, s.pricing.category, s.pricing.type, s.pricing.subtype, s.pricing.billable, s.timestamp, market, cost, currency],
                );
                await this.setBilling(row.place_id, 'OK', true);
            } catch (err) {
                this.logger.warn(`No se pudo registrar el estado del mensaje ${s.wamid}: ${(err as Error).message}`);
            }
        }
    }

    /** Envío rechazado al momento por falta de pago (error 131042 en la respuesta de Meta). */
    async markPaymentIssue(placeId: string) {
        await this.setBilling(placeId, 'SIN_PAGO').catch(() => undefined);
    }

    async billing(placeId: string): Promise<BillingStatus> {
        const [row] = await this.dataSource.query(`SELECT metadata->'whatsappBilling' AS billing FROM wuarike_db.places WHERE id = $1`, [placeId]);
        return row?.billing ?? null;
    }

    /** onlyIfBlocked: al entregarse un mensaje solo se escribe si el local estaba SIN_PAGO (no en cada entrega). */
    private async setBilling(placeId: string, status: 'OK' | 'SIN_PAGO', onlyIfBlocked = false) {
        await this.dataSource.query(
            `UPDATE wuarike_db.places SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{whatsappBilling}', $2::jsonb, true)
             WHERE id = $1 ${onlyIfBlocked ? `AND metadata->'whatsappBilling'->>'status' = 'SIN_PAGO'` : ''}`,
            [placeId, JSON.stringify({ status, at: new Date().toISOString() })],
        );
    }

    // ── Consumo para el panel ────────────────────────────────────────────
    async consumption(placeId: string, month: string) {
        const { from, to, days } = monthBounds(month);
        const numbers: any[] = await this.dataSource.query(
            `SELECT n.phone_number_id, n.phone_number, n.waba_id, n.billing_currency,
                    EXISTS (SELECT 1 FROM wuarike_db.whatsapp_numbers o WHERE o.waba_id = n.waba_id AND o.place_id <> n.place_id) AS shared_waba
             FROM wuarike_db.whatsapp_numbers n WHERE n.place_id = $1 AND n.provider = 'meta' AND n.is_active`,
            [placeId],
        );
        const bySource: any[] = await this.dataSource.query(
            `SELECT source, count(*)::int AS messages, count(*) FILTER (WHERE billable)::int AS billable,
                    count(*) FILTER (WHERE billable = false)::int AS free, count(*) FILTER (WHERE pricing_type = 'free_entry_point')::int AS free_entry,
                    COALESCE(sum(est_cost), 0)::float AS cost, count(*) FILTER (WHERE billable AND est_cost IS NULL)::int AS unpriced
             FROM wuarike_db.whatsapp_message_costs WHERE place_id = $1 AND sent_at >= $2 AND sent_at < $3 GROUP BY source ORDER BY cost DESC`,
            [placeId, from, to],
        );
        const service: any[] = await this.dataSource.query(
            `SELECT phone_number_id, count(*)::int AS used FROM wuarike_db.whatsapp_message_costs
             WHERE place_id = $1 AND category = 'service' AND delivered_at >= $2 AND delivered_at < $3 GROUP BY phone_number_id`,
            [placeId, from, to],
        );
        // La cifra oficial es por WABA: solo se muestra si el WABA es de este local (no compartido con otros).
        const ownWabas = [...new Set(numbers.filter((n) => n.waba_id && !n.shared_waba).map((n) => n.waba_id))];
        const [official] = ownWabas.length ? await this.dataSource.query(
            `SELECT sum(cost)::float AS cost, max(day) AS last_day FROM wuarike_db.whatsapp_daily_costs WHERE waba_id = ANY($1) AND day >= $2 AND day < $3`,
            [ownWabas, `${month}-01`, limaDay(to)],
        ) : [null];

        const estimated = Math.round(bySource.reduce((sum, r) => sum + r.cost, 0) * 100) / 100;
        const today = limaDay(new Date());
        const current = today.slice(0, 7) === month;
        return {
            month,
            currency: numbers.find((n) => n.billing_currency)?.billing_currency ?? null,
            hasNumber: numbers.length > 0,
            paidByWuarikes: numbers.some((n) => n.waba_id === WUARIKES_WABA()),
            estimated,
            official: official?.cost ?? null,
            officialUntil: official?.last_day ?? null,
            projection: current ? projectMonth(estimated, Number(today.slice(8, 10)), days) : null,
            unpriced: bySource.reduce((sum, r) => sum + r.unpriced, 0),
            bySource: bySource.map((r) => ({ source: r.source, messages: r.messages, billable: r.billable, free: r.free, freeEntryPoint: r.free_entry, cost: Math.round(r.cost * 100) / 100 })),
            freeService: numbers.map((n) => ({ phoneNumber: n.phone_number, used: service.find((x) => x.phone_number_id === n.phone_number_id)?.used ?? 0, limit: FREE_SERVICE_PER_MONTH })),
            billing: await this.billing(placeId),
        };
    }

    // ── Panel de plataforma ──────────────────────────────────────────────
    async platformSummary(month: string) {
        const { from, to } = monthBounds(month);
        const rows: any[] = await this.dataSource.query(
            `SELECT p.id AS place_id, p.name AS place_name, p.metadata->'whatsappBilling'->>'status' AS billing,
                    n.waba_id, n.billing_currency AS currency,
                    count(c.wamid) FILTER (WHERE c.billable AND c.category = 'marketing')::int AS marketing,
                    count(c.wamid) FILTER (WHERE c.billable AND c.category = 'utility')::int AS utility,
                    count(c.wamid) FILTER (WHERE c.billable AND c.category = 'service')::int AS service,
                    count(c.wamid) FILTER (WHERE c.category = 'service')::int AS service_used,
                    COALESCE(sum(c.est_cost), 0)::float AS estimated
             FROM wuarike_db.whatsapp_numbers n
             JOIN wuarike_db.places p ON p.id = n.place_id
             LEFT JOIN wuarike_db.whatsapp_message_costs c ON c.phone_number_id = n.phone_number_id AND c.sent_at >= $1 AND c.sent_at < $2
             WHERE n.provider = 'meta' AND n.is_active
             GROUP BY p.id, p.name, n.waba_id, n.billing_currency, n.phone_number_id
             ORDER BY estimated DESC`,
            [from, to],
        );
        const official: any[] = await this.dataSource.query(
            `SELECT waba_id, sum(cost)::float AS cost FROM wuarike_db.whatsapp_daily_costs WHERE day >= $1 AND day < $2 GROUP BY waba_id`,
            [`${month}-01`, limaDay(to)],
        );
        const wuarikes = WUARIKES_WABA();
        return {
            month,
            wuarikesWaba: wuarikes,
            paidByWuarikes: {
                estimated: Math.round(rows.filter((r) => r.waba_id === wuarikes).reduce((s, r) => s + r.estimated, 0) * 100) / 100,
                official: official.find((o) => o.waba_id === wuarikes)?.cost ?? null,
            },
            places: rows.map((r) => ({
                placeId: r.place_id, placeName: r.place_name, wabaId: r.waba_id, currency: r.currency, billing: r.billing ?? 'OK',
                billable: { marketing: r.marketing, utility: r.utility, service: r.service }, serviceUsed: r.service_used, serviceLimit: FREE_SERVICE_PER_MONTH,
                estimated: Math.round(r.estimated * 100) / 100, official: official.find((o) => o.waba_id === r.waba_id)?.cost ?? null,
                paidByWuarikes: r.waba_id === wuarikes,
            })),
        };
    }

    listRates(): Promise<Rate[]> {
        return this.dataSource.query(
            `SELECT market, category, currency, rate_per_message::float AS rate, to_char(valid_from, 'YYYY-MM-DD') AS "validFrom"
             FROM wuarike_db.whatsapp_rates ORDER BY valid_from DESC, market, category`,
        );
    }

    async saveRate(r: Rate) {
        await this.dataSource.query(
            `INSERT INTO wuarike_db.whatsapp_rates (market, category, currency, rate_per_message, valid_from) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (market, category, currency, valid_from) DO UPDATE SET rate_per_message = EXCLUDED.rate_per_message`,
            [r.market, r.category, r.currency, r.rate, r.validFrom],
        );
        this.rates = null;
        return this.listRates();
    }

    private async rateList(): Promise<Rate[]> {
        if (!this.rates || Date.now() - this.rates.at > 5 * 60_000) this.rates = { at: Date.now(), list: await this.listRates() };
        return this.rates.list;
    }

    /** Moneda del WABA (la elige el local en Meta): se pregunta una vez y se guarda en el número. */
    private async fetchCurrency(n: { waba_id: string | null; number_id: string | null }): Promise<string | null> {
        if (!n.waba_id || !n.number_id) return null;
        try {
            const { data } = await axios.get(`${graph()}/${n.waba_id}`, {
                params: { fields: 'currency' },
                headers: { Authorization: `Bearer ${await this.token(n.number_id)}` },
                timeout: 15000,
            });
            if (!data?.currency) return null;
            await this.dataSource.query(`UPDATE wuarike_db.whatsapp_numbers SET billing_currency = $2 WHERE waba_id = $1`, [n.waba_id, data.currency]);
            return data.currency;
        } catch (err: any) {
            this.logger.warn(`No se pudo leer la moneda del WABA ${n.waba_id}: ${err?.response?.data?.error?.message || err?.message}`);
            return null;
        }
    }

    /** Token del número (Embedded Signup; la entidad lo descifra) o, si no tiene, el del sistema. */
    private async token(numberId: string) {
        const n = await this.numbers.findOne({ where: { id: numberId } });
        return n?.whatsappApiToken || process.env.WHATSAPP_API_TOKEN || '';
    }

    /** Cifra oficial de Meta: costo de ayer por WABA, categoría, tipo y país (pricing_analytics). */
    @Cron('0 6 * * *', { timeZone: 'America/Lima' })
    async syncOfficialCosts() {
        const wabas: any[] = await this.dataSource.query(
            `SELECT DISTINCT ON (waba_id) waba_id, id AS number_id, billing_currency
             FROM wuarike_db.whatsapp_numbers WHERE provider = 'meta' AND is_active AND waba_id IS NOT NULL`,
        );
        const today = limaDay(new Date());
        const start = Math.floor(limaStart(today).getTime() / 1000) - 86400;
        const end = start + 86400;
        for (const w of wabas) {
            try {
                const currency = w.billing_currency ?? (await this.fetchCurrency(w));
                const { data } = await axios.get(`${graph()}/${w.waba_id}`, {
                    params: { fields: `pricing_analytics.start(${start}).end(${end}).granularity(DAILY).dimensions(["PRICING_CATEGORY","PRICING_TYPE","COUNTRY"])` },
                    headers: { Authorization: `Bearer ${await this.token(w.number_id)}` },
                    timeout: 20000,
                });
                for (const p of data?.pricing_analytics?.data?.flatMap((d: any) => d.data_points ?? []) ?? []) {
                    await this.dataSource.query(
                        `INSERT INTO wuarike_db.whatsapp_daily_costs (waba_id, day, category, pricing_type, country, volume, cost, currency)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                         ON CONFLICT (waba_id, day, category, pricing_type, country) DO UPDATE SET volume = EXCLUDED.volume, cost = EXCLUDED.cost, currency = EXCLUDED.currency`,
                        [w.waba_id, limaDay(new Date(Number(p.start) * 1000)), String(p.pricing_category ?? 'UNKNOWN').toLowerCase(), String(p.pricing_type ?? 'UNKNOWN').toLowerCase(),
                            p.country ?? '--', Number(p.volume ?? 0), Number(p.cost ?? 0), currency],
                    );
                }
            } catch (err: any) {
                this.logger.error(`Costo oficial de Meta (WABA ${w.waba_id}) no disponible; se reintenta mañana: ${err?.response?.data?.error?.message || err?.message}`);
            }
        }
    }
}
