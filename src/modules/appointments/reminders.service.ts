import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { WhatsAppTemplatesService } from '../messaging/whatsapp-templates.service';
import { WhatsAppCloudService, buildBodyComponents } from '../messaging/whatsapp-cloud.service';
import { isMetaEnabled } from '../messaging/meta-flag';
import type { CreateTemplateInput } from '../messaging/whatsapp-templates.util';
import { dayLabel, limaDate, limaTime, timeLabel } from './appointments.rules';

/** Plantillas que el sistema crea en el WhatsApp del local (Meta debe aprobarlas antes de usarlas). */
export const SYSTEM_TEMPLATES: Record<'reminder' | 'vehicleReady', CreateTemplateInput> = {
    reminder: {
        name: 'recordatorio_cita', language: 'es', category: 'UTILITY',
        body: 'Hola {{1}}, te recordamos tu cita de {{2}} con {{3}} el {{4}} a las {{5}} en {{6}}. Si no puedes asistir, cancélala aquí: {{7}} ¡Te esperamos!',
        bodyExamples: ['Luis', 'Corte clásico', 'Juan', 'sábado 25', '4:00 pm', 'Barbería Don Juan', 'https://admin.wuarikes.com/reservar/cita/abc'],
    },
    vehicleReady: {
        name: 'vehiculo_listo', language: 'es', category: 'UTILITY',
        body: 'Hola {{1}}, tu vehículo {{2}} ya está listo para recoger en {{3}}. ¡Gracias por tu preferencia!',
        bodyExamples: ['Luis', 'ABC-123', 'Taller El Rápido'],
    },
};
type TemplateKey = keyof typeof SYSTEM_TEMPLATES;
export type TemplateStatus = 'NO_WHATSAPP' | 'NOT_CREATED' | 'PENDING' | 'APPROVED' | 'REJECTED';

/** Nombre del cliente para la plantilla: solo letras y espacios, corto; sin enlaces ni números (evita texto de terceros). */
export function safeName(name: string | null): string {
    const clean = (name ?? '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return clean.length >= 2 ? clean : 'cliente';
}

/** Recordatorios de citas por WhatsApp: 24 h y 2 h antes, desde el número del local, con plantilla aprobada. */
@Injectable()
export class RemindersService {
    private readonly logger = new Logger(RemindersService.name);
    /** Estado de la plantilla por local (se reconsulta a Meta como mucho cada 30 min). */
    private statusCache = new Map<string, { status: TemplateStatus; at: number }>();
    private running = false;

    constructor(
        @InjectRepository(Place) private placesRepo: Repository<Place>,
        @InjectRepository(WhatsAppNumber) private numbersRepo: Repository<WhatsAppNumber>,
        private templates: WhatsAppTemplatesService,
        private cloud: WhatsAppCloudService,
        private dataSource: DataSource,
        private config: ConfigService,
    ) { }

    /** Estado para el panel: si hay WhatsApp conectado, si la plantilla existe/está aprobada y si están activados. */
    async status(placeId: string, key: TemplateKey = 'reminder') {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        const enabled = place?.metadata?.reminders?.enabled !== false;
        return { enabled, template: await this.templateStatus(placeId, key, true) };
    }

    /** Crea en Meta la plantilla del sistema si no existe y devuelve su estado. */
    async ensureTemplate(placeId: string, key: TemplateKey = 'reminder') {
        const current = await this.templateStatus(placeId, key, true);
        if (current === 'NOT_CREATED') {
            await this.templates.create(placeId, SYSTEM_TEMPLATES[key]);
            this.statusCache.delete(`${placeId}:${key}`);
        }
        return { template: await this.templateStatus(placeId, key, true) };
    }

    async setEnabled(placeId: string, enabled: boolean) {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        if (!place) return { enabled };
        await this.placesRepo.update(placeId, { metadata: { ...(place.metadata ?? {}), reminders: { ...(place.metadata?.reminders ?? {}), enabled } } });
        return { enabled };
    }

    /** Envía una plantilla del sistema al cliente desde el número del local (lo usa también "vehículo listo"). */
    async sendSystemTemplate(placeId: string, key: TemplateKey, to: string, values: string[]): Promise<boolean> {
        if ((await this.templateStatus(placeId, key)) !== 'APPROVED') return false;
        const number = await this.metaNumber(placeId);
        if (!number) return false;
        const t = SYSTEM_TEMPLATES[key];
        await this.cloud.sendTemplate(number, to, t.name, t.language, buildBodyComponents(values));
        return true;
    }

    @Cron(CronExpression.EVERY_10_MINUTES)
    async run() {
        if (this.running) return;
        this.running = true;
        try {
            await this.sendDue('24', `a.starts_at > now() + interval '2 hours' AND a.starts_at <= now() + interval '24 hours'`);
            // 2 h antes: solo si la cita se reservó con anticipación (no recordarle a quien acaba de reservar).
            await this.sendDue('2', `a.starts_at > now() AND a.starts_at <= now() + interval '2 hours' AND a.created_at < a.starts_at - interval '2 hours'`);
        } catch (err) {
            this.logger.error(`Recordatorios: ${(err as Error).message}`);
        } finally {
            this.running = false;
        }
    }

    private async sendDue(which: '24' | '2', window: string) {
        const col = which === '24' ? 'reminder_24_sent_at' : 'reminder_2_sent_at';
        const due: any[] = await this.dataSource.query(
            `SELECT a.id, a.place_id, a.customer_name, a.customer_phone, a.service_name, a.starts_at, a.public_token, p.name AS pro, pl.name AS place_name
             FROM wuarike_db.appointments a
             JOIN wuarike_db.place_professionals p ON p.id = a.professional_id
             JOIN wuarike_db.places pl ON pl.id = a.place_id
             WHERE a.status = 'RESERVADA' AND a.customer_phone IS NOT NULL AND a.${col} IS NULL AND ${window}
               -- Solo números verificados: el que escribió por WhatsApp (bot), el que cargó el personal (panel) o, desde el
               -- link público, un número que ya le escribió antes al negocio. Así nadie usa el WhatsApp del local contra un tercero.
               AND (a.source IN ('BOT', 'PANEL') OR EXISTS (
                 SELECT 1 FROM wuarike_db.conversations c WHERE c.place_id = a.place_id AND regexp_replace(c.customer_phone, '\D', '', 'g') = a.customer_phone))
               AND COALESCE(pl.metadata->'reminders'->>'enabled', 'true') <> 'false'
             LIMIT 200`,
        );
        const dashboard = this.config.get<string>('DASHBOARD_URL') || 'https://admin.wuarikes.com';
        for (const a of due) {
            if ((await this.templateStatus(a.place_id, 'reminder')) !== 'APPROVED') continue;
            // Reclamo condicional: si dos instancias corren a la vez, solo una envía.
            const [rows] = await this.dataSource.query(`UPDATE wuarike_db.appointments SET ${col} = now() WHERE id = $1 AND ${col} IS NULL RETURNING id`, [a.id]);
            if (!(Array.isArray(rows) ? rows.length : rows)) continue;
            const start = new Date(a.starts_at);
            try {
                await this.sendSystemTemplate(a.place_id, 'reminder', a.customer_phone, [
                    safeName(a.customer_name), a.service_name, a.pro, dayLabel(limaDate(start)), timeLabel(limaTime(start)), a.place_name, `${dashboard}/reservar/cita/${a.public_token}`,
                ]);
            } catch (err) {
                this.logger.warn(`No se pudo enviar el recordatorio ${which}h de la cita ${a.id}: ${(err as Error).message}`);
            }
        }
    }

    private async metaNumber(placeId: string): Promise<WhatsAppNumber | null> {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        if (!isMetaEnabled(place)) return null;
        return this.numbersRepo.findOne({ where: { placeId, provider: 'meta', isActive: true }, order: { createdAt: 'DESC' } });
    }

    private async templateStatus(placeId: string, key: TemplateKey, fresh = false): Promise<TemplateStatus> {
        const cacheKey = `${placeId}:${key}`;
        const hit = this.statusCache.get(cacheKey);
        if (!fresh && hit && Date.now() - hit.at < 30 * 60_000) return hit.status;
        let status: TemplateStatus;
        const number = await this.metaNumber(placeId);
        if (!number?.wabaId) status = 'NO_WHATSAPP';
        else {
            try {
                const t = (await this.templates.list(placeId)).find((x) => x.name === SYSTEM_TEMPLATES[key].name);
                status = !t ? 'NOT_CREATED' : t.status === 'APPROVED' ? 'APPROVED' : t.status === 'REJECTED' ? 'REJECTED' : 'PENDING';
            } catch {
                status = hit?.status ?? 'NO_WHATSAPP';
            }
        }
        this.statusCache.set(cacheKey, { status, at: Date.now() });
        return status;
    }
}
