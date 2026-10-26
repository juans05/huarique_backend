import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';
import { RemindersService, safeName } from './reminders.service';
import { addDays, dayLabel, limaDate } from './appointments.rules';

export const DEFAULT_NOTICE_DAYS = 2;
/** Pasados estos días desde que le tocaba, ya no se le avisa (no perseguir clientes perdidos). */
export const RECALL_GRACE_DAYS = 30;
/** La vista "Por volver" muestra a quien le toca en los próximos 14 días o venció hace hasta 30. */
export const UPCOMING_DAYS = 14;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400_000);

/** Fechas (Lima, YYYY-MM-DD) de la rutina: última visita, cuándo le toca y cuándo se le avisa. */
export function recallDates(lastVisit: Date, recallDays: number, noticeDays: number | null) {
    const last = limaDate(lastVisit);
    const due = addDays(last, recallDays);
    return { last, due, notice: addDays(due, -(noticeDays ?? DEFAULT_NOTICE_DAYS)) };
}

/** ¿Hay que avisarle hoy? Desde el día de aviso hasta 30 días después de que le tocaba; un solo aviso por visita. */
export function shouldNotify(today: string, dates: { due: string; notice: string }, c: { notified: boolean; hasFuture: boolean; optedOut: boolean; verified: boolean }) {
    return today >= dates.notice && today <= addDays(dates.due, RECALL_GRACE_DAYS) && !c.notified && !c.hasFuture && !c.optedOut && c.verified;
}

/** {{2}} de la plantilla: "en 3 días", "mañana", "hoy" o, si ya pasó, "ya". */
export function whenLabel(today: string, due: string) {
    const n = daysBetween(today, due);
    return n > 1 ? `en ${n} días` : n === 1 ? 'mañana' : n === 0 ? 'hoy' : 'ya';
}

type Candidate = {
    id: string; place_id: string; service_id: string; customer_name: string; customer_phone: string; starts_at: Date;
    service_name: string; recall_days: number; recall_notice_days: number | null; place_name: string;
    notified_at: Date | null; has_future: boolean; opted_out: boolean; verified: boolean;
};

/**
 * Aviso de rutina: a quien se atiende un servicio "cada N días" (ej. corte cada 20) se le escribe unos días antes de
 * que le toque, contando desde su ÚLTIMA cita atendida de ese servicio. Si vuelve antes, el conteo se reinicia solo.
 */
@Injectable()
export class RecallService {
    private readonly logger = new Logger(RecallService.name);
    private running = false;

    constructor(
        @InjectRepository(Place) private placesRepo: Repository<Place>,
        private reminders: RemindersService,
        private dataSource: DataSource,
        private config: ConfigService,
    ) { }

    async settings(placeId: string) {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        return { enabled: place?.metadata?.recall?.enabled === true, ...(await this.reminders.templateInfo(placeId, 'recall')) };
    }

    async setEnabled(placeId: string, enabled: boolean) {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        if (place) await this.placesRepo.update(placeId, { metadata: { ...(place.metadata ?? {}), recall: { ...(place.metadata?.recall ?? {}), enabled } } });
        return this.settings(placeId);
    }

    async ensureTemplate(placeId: string) {
        await this.reminders.ensureTemplate(placeId, 'recall');
        return this.settings(placeId);
    }

    /** Vista "Por volver": a quién le toca pronto o ya le tocó, con su estado de aviso. */
    async upcoming(placeId: string) {
        const today = limaDate(new Date());
        return (await this.candidates(placeId, false))
            .map((c) => ({ c, d: recallDates(c.starts_at, c.recall_days, c.recall_notice_days) }))
            .filter(({ d }) => d.due <= addDays(today, UPCOMING_DAYS) && d.due >= addDays(today, -RECALL_GRACE_DAYS))
            .sort((a, b) => a.d.due.localeCompare(b.d.due))
            .map(({ c, d }) => ({
                appointmentId: c.id, customerName: c.customer_name, customerPhone: c.customer_phone, serviceId: c.service_id, serviceName: c.service_name,
                lastVisit: d.last, dueDate: d.due, noticeDate: d.notice, notifiedAt: c.notified_at, hasFuture: c.has_future, optedOut: c.opted_out,
                canNotify: !c.notified_at && !c.has_future && !c.opted_out && c.verified,
            }));
    }

    /** Para la vista Mes: cuántos clientes que aún no reservaron les toca cada día del rango. */
    async dueByDay(placeId: string, from: string, to: string): Promise<Record<string, number>> {
        const out: Record<string, number> = {};
        for (const c of await this.candidates(placeId, false)) {
            if (c.has_future) continue;
            const { due } = recallDates(c.starts_at, c.recall_days, c.recall_notice_days);
            if (due >= from && due <= to) out[due] = (out[due] ?? 0) + 1;
        }
        return out;
    }

    /** "Avisar ahora" desde el panel: mismo reclamo que el cron, así nunca salen dos avisos por la misma visita. */
    async notifyNow(placeId: string, appointmentId: string) {
        const c = (await this.candidates(placeId, false)).find((x) => x.id === appointmentId);
        if (!c) throw new NotFoundException('Ese cliente no tiene un servicio de rutina pendiente');
        if (c.notified_at) throw new BadRequestException('Ya se le avisó por esta visita');
        if (c.has_future) throw new BadRequestException('Este cliente ya tiene una cita reservada');
        if (c.opted_out) throw new BadRequestException('Este cliente pidió no recibir mensajes (escribió BAJA)');
        if (!c.verified) throw new BadRequestException('Su número no está verificado: nunca le escribió al negocio por WhatsApp');
        if ((await this.reminders.templateStatus(placeId, 'recall')) !== 'APPROVED') throw new BadRequestException('La plantilla de aviso aún no está aprobada por Meta');
        if (!(await this.send(c, limaDate(new Date())))) throw new BadRequestException('No se pudo enviar el aviso por WhatsApp');
        return { notified: true };
    }

    // Dos pasadas al día dentro del horario permitido (9:00–20:00 de Lima); la segunda cubre un reinicio a la hora de la primera.
    @Cron('0 10,16 * * *', { timeZone: 'America/Lima' })
    async run() {
        if (this.running) return;
        this.running = true;
        try {
            const today = limaDate(new Date());
            const approved = new Map<string, boolean>();
            for (const c of await this.candidates(null, true)) {
                const dates = recallDates(c.starts_at, c.recall_days, c.recall_notice_days);
                if (!shouldNotify(today, dates, { notified: !!c.notified_at, hasFuture: c.has_future, optedOut: c.opted_out, verified: c.verified })) continue;
                if (!approved.has(c.place_id)) approved.set(c.place_id, (await this.reminders.templateStatus(c.place_id, 'recall')) === 'APPROVED');
                if (!approved.get(c.place_id)) continue;
                await this.send(c, today);
            }
        } catch (err) {
            this.logger.error(`Avisos de rutina: ${(err as Error).message}`);
        } finally {
            this.running = false;
        }
    }

    private async send(c: Candidate, today: string): Promise<boolean> {
        const claimed = await this.dataSource.query(
            `INSERT INTO wuarike_db.appointment_recalls (source_appointment_id, place_id, service_id, customer_phone) VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING RETURNING source_appointment_id`,
            [c.id, c.place_id, c.service_id, c.customer_phone],
        );
        if (!claimed.length) return false;
        const dates = recallDates(c.starts_at, c.recall_days, c.recall_notice_days);
        const dashboard = this.config.get<string>('DASHBOARD_URL') || 'https://admin.wuarikes.com';
        let sent = false;
        try {
            sent = await this.reminders.sendSystemTemplate(c.place_id, 'recall', c.customer_phone, [
                safeName(c.customer_name), whenLabel(today, dates.due), c.service_name.toLowerCase(), c.place_name, dayLabel(dates.last), `${dashboard}/reservar/${c.place_id}`,
            ]);
        } catch (err) {
            this.logger.warn(`No se pudo enviar el aviso de rutina de la cita ${c.id}: ${(err as Error).message}`);
        }
        // Si no salió, se libera el reclamo para reintentar en la siguiente pasada.
        if (!sent) await this.dataSource.query(`DELETE FROM wuarike_db.appointment_recalls WHERE source_appointment_id = $1`, [c.id]);
        return sent;
    }

    /**
     * Última cita ATENDIDA por cliente (últimos 9 dígitos) y servicio de rutina, con lo que decide el aviso.
     * onlyEnabled: solo locales que activaron los avisos (el cron); el panel ve siempre su lista.
     */
    private candidates(placeId: string | null, onlyEnabled: boolean): Promise<Candidate[]> {
        const phone9 = (col: string) => `right(regexp_replace(${col}, '\\D', '', 'g'), 9)`;
        return this.dataSource.query(
            `WITH last AS (
               SELECT DISTINCT ON (a.place_id, a.service_id, ${phone9('a.customer_phone')})
                      a.id, a.place_id, a.service_id, a.customer_name, a.customer_phone, a.starts_at, a.source, ${phone9('a.customer_phone')} AS phone9
               FROM wuarike_db.appointments a
               WHERE a.status = 'ATENDIDA' AND a.customer_phone IS NOT NULL AND a.service_id IS NOT NULL
                 AND a.starts_at > now() - interval '400 days' AND ($1::uuid IS NULL OR a.place_id = $1::uuid)
               ORDER BY a.place_id, a.service_id, ${phone9('a.customer_phone')}, a.starts_at DESC
             )
             SELECT l.id, l.place_id, l.service_id, l.customer_name, l.customer_phone, l.starts_at,
                    d.name AS service_name, d.recall_days, d.recall_notice_days, pl.name AS place_name,
                    (SELECT r.sent_at FROM wuarike_db.appointment_recalls r WHERE r.source_appointment_id = l.id) AS notified_at,
                    EXISTS (SELECT 1 FROM wuarike_db.appointments f WHERE f.place_id = l.place_id AND f.status = 'RESERVADA'
                            AND f.starts_at > now() AND ${phone9('f.customer_phone')} = l.phone9) AS has_future,
                    EXISTS (SELECT 1 FROM wuarike_db.whatsapp_opt_outs o WHERE o.place_id = l.place_id AND o.phone9 = l.phone9) AS opted_out,
                    -- Mismo criterio que los recordatorios: número del bot o del panel, o uno que ya le escribió al negocio
                    -- (número completo, no los últimos 9: el aviso sale a l.customer_phone y debe ser ese mismo).
                    (l.source IN ('BOT', 'PANEL') OR EXISTS (SELECT 1 FROM wuarike_db.conversations c
                            WHERE c.place_id = l.place_id AND regexp_replace(c.customer_phone, '\\D', '', 'g') = regexp_replace(l.customer_phone, '\\D', '', 'g'))) AS verified
             FROM last l
             JOIN wuarike_db.dishes d ON d.id = l.service_id AND d.place_id = l.place_id AND d.recall_days IS NOT NULL
             JOIN wuarike_db.places pl ON pl.id = l.place_id
             WHERE NOT $2::boolean OR COALESCE(pl.metadata->'recall'->>'enabled', 'false') = 'true'`,
            [placeId, onlyEnabled],
        );
    }
}
