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
import { paymentBlockedToday } from '../messaging/whatsapp-billing.service';
import type { CreateTemplateInput } from '../messaging/whatsapp-templates.util';
import { dayLabel, limaDate, limaTime, timeLabel } from './appointments.rules';

/** Plantillas que el sistema crea en el WhatsApp del local (Meta debe aprobarlas antes de usarlas). */
export const SYSTEM_TEMPLATES: Record<'reminder' | 'recall' | 'vehicleReady' | 'petReady', CreateTemplateInput> = {
    reminder: {
        name: 'recordatorio_cita', language: 'es', category: 'UTILITY',
        body: 'Hola {{1}}, te recordamos tu cita de {{2}} con {{3}} el {{4}} a las {{5}} en {{6}}. Si no puedes asistir, cancélala aquí: {{7}} ¡Te esperamos!',
        bodyExamples: ['Luis', 'Corte clásico', 'Juan', 'sábado 25', '4:00 pm', 'Barbería Don Juan', 'https://admin.wuarikes.com/reservar/cita/abc'],
    },
    // Aviso de rutina: {{2}} es "en 2 días", "mañana" u "hoy" (ver whenLabel en recall.service).
    recall: {
        name: 'aviso_proximo_servicio', language: 'es', category: 'UTILITY',
        body: 'Hola {{1}}, {{2}} se cumple el tiempo de tu próximo {{3}} en {{4}} (tu última visita fue el {{5}}). Puedes reservar aquí: {{6}} o respondernos por este chat. Si no quieres estos avisos, escribe BAJA.',
        bodyExamples: ['Luis', 'en 2 días', 'Corte clásico', 'Barbería Don Juan', 'sábado 4', 'https://admin.wuarikes.com/reservar/abc'],
    },
    vehicleReady: {
        name: 'vehiculo_listo', language: 'es', category: 'UTILITY',
        body: 'Hola {{1}}, tu vehículo {{2}} ya está listo para recoger en {{3}}. ¡Gracias por tu preferencia!',
        bodyExamples: ['Luis', 'ABC-123', 'Taller El Rápido'],
    },
    petReady: {
        name: 'mascota_lista', language: 'es', category: 'UTILITY',
        body: 'Hola {{1}}, {{2}} ya está listo para recoger en {{3}}. ¡Gracias por confiar en nosotros!',
        bodyExamples: ['María', 'Firulais', 'Huellitas Spa'],
    },
};

/** Plantilla de "listo para recoger" según la ficha del rubro. */
export const READY_TEMPLATE = { PET: 'petReady', VEHICLE: 'vehicleReady' } as const;
export type TemplateKey = keyof typeof SYSTEM_TEMPLATES;
export type TemplateStatus = 'NO_WHATSAPP' | 'NOT_CREATED' | 'PENDING' | 'APPROVED' | 'REJECTED';

/** Nombre del cliente para la plantilla: solo letras y espacios, corto; sin enlaces ni números (evita texto de terceros). */
export function safeName(name: string | null): string {
    const clean = (name ?? '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return clean.length >= 2 ? clean : 'cliente';
}

/** Nombre de la mascota (como safeName) o placa (solo letras, números y guion) para la plantilla: sin enlaces ni texto libre. */
export function safeAssetName(kind: 'PET' | 'VEHICLE', name: string): string {
    if (kind === 'PET') { const n = safeName(name); return n === 'cliente' ? 'tu mascota' : n; }
    const plate = name.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10);
    return plate.length >= 3 ? plate : 'tu vehículo';
}

/** Tiempos de recordatorio por defecto (minutos antes de la cita): uno, 1 día antes. */
export const DEFAULT_OFFSETS = [1440];
export const MIN_OFFSET = 30;
export const MAX_OFFSET = 7 * 1440;
export const MAX_OFFSETS = 3;

/** Tiempos válidos del local: enteros entre 30 min y 7 días, sin repetir, de mayor a menor, hasta 3. */
export function normalizeOffsets(raw: unknown): number[] {
    if (!Array.isArray(raw)) return DEFAULT_OFFSETS;
    const valid = [...new Set(raw.filter((o) => Number.isInteger(o) && o >= MIN_OFFSET && o <= MAX_OFFSET) as number[])].sort((a, b) => b - a).slice(0, MAX_OFFSETS);
    return valid.length ? valid : DEFAULT_OFFSETS;
}

/**
 * Qué recordatorio toca ahora para una cita, o null. Toca el más cercano a la cita que ya entró en su ventana
 * (si el cron se atrasó o la cita se reservó tarde, nunca salen dos juntos), salvo que la cita se haya creado
 * después de la hora en que tocaba (no recordarle a quien acaba de reservar) o que ya se haya enviado.
 */
export function dueOffset(startsAt: Date, createdAt: Date, offsets: number[], now: Date, sent: number[]): number | null {
    const minutesLeft = (startsAt.getTime() - now.getTime()) / 60_000;
    if (minutesLeft <= 0) return null;
    const due = offsets.filter((o) => minutesLeft <= o);
    if (!due.length) return null;
    const offset = Math.min(...due);
    if (createdAt.getTime() >= startsAt.getTime() - offset * 60_000) return null;
    return sent.includes(offset) ? null : offset;
}

/** Recordatorios de citas por WhatsApp en los tiempos que elige el local, desde su número, con plantilla aprobada. */
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

    /** Estado para el panel: si hay WhatsApp conectado, si la plantilla existe/está aprobada, si están activados y cuándo salen. */
    async status(placeId: string) {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        const enabled = place?.metadata?.reminders?.enabled !== false;
        return { enabled, offsetsMin: normalizeOffsets(place?.metadata?.reminders?.offsetsMin), template: await this.templateStatus(placeId, 'reminder', true) };
    }

    /** Crea las plantillas que usa el local: el recordatorio y, si atiende mascotas o vehículos, la de "listo para recoger". */
    async ensureTemplates(placeId: string, assetKind: 'PET' | 'VEHICLE' | null) {
        const result = await this.ensureTemplate(placeId, 'reminder');
        if (assetKind) await this.ensureTemplate(placeId, READY_TEMPLATE[assetKind]).catch((err) => this.logger.warn(`Plantilla listo: ${(err as Error).message}`));
        return result;
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

    async setSettings(placeId: string, settings: { enabled?: boolean; offsetsMin?: number[] }) {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        if (!place) return this.status(placeId);
        const reminders = { ...(place.metadata?.reminders ?? {}) };
        if (settings.enabled !== undefined) reminders.enabled = settings.enabled;
        if (settings.offsetsMin !== undefined) reminders.offsetsMin = normalizeOffsets(settings.offsetsMin);
        await this.placesRepo.update(placeId, { metadata: { ...(place.metadata ?? {}), reminders } });
        return this.status(placeId);
    }

    /** Envía una plantilla del sistema al cliente desde el número del local (lo usa también "vehículo listo"). */
    async sendSystemTemplate(placeId: string, key: TemplateKey, to: string, values: string[]): Promise<boolean> {
        if ((await this.templateStatus(placeId, key)) !== 'APPROVED') return false;
        const place = await this.placesRepo.findOne({ where: { id: placeId }, select: ['id', 'metadata'] });
        // Hoy Meta ya rechazó un envío por falta de método de pago: no se insiste hasta mañana.
        if (paymentBlockedToday(place?.metadata?.whatsappBilling)) return false;
        const number = await this.metaNumber(placeId);
        if (!number) return false;
        const t = SYSTEM_TEMPLATES[key];
        await this.cloud.sendTemplate(number, to, t.name, t.language, buildBodyComponents(values), key === 'reminder' ? 'reminder' : key === 'recall' ? 'recall' : 'ready');
        return true;
    }

    @Cron(CronExpression.EVERY_10_MINUTES)
    async run() {
        if (this.running) return;
        this.running = true;
        try {
            await this.sendDue();
        } catch (err) {
            this.logger.error(`Recordatorios: ${(err as Error).message}`);
        } finally {
            this.running = false;
        }
    }

    private async sendDue() {
        // ponytail: trae las citas de los próximos 7 días (el tiempo máximo) y decide en memoria; si algún día
        // pasan de miles, filtrar en SQL por el mayor tiempo de cada local.
        const rows: any[] = await this.dataSource.query(
            `SELECT a.id, a.place_id, a.customer_name, a.customer_phone, a.service_name, a.starts_at, a.created_at, a.public_token,
                    p.name AS pro, pl.name AS place_name, pl.metadata->'reminders'->'offsetsMin' AS offsets,
                    COALESCE((SELECT array_agg(r.offset_min) FROM wuarike_db.appointment_reminders r WHERE r.appointment_id = a.id), '{}') AS sent
             FROM wuarike_db.appointments a
             JOIN wuarike_db.place_professionals p ON p.id = a.professional_id
             JOIN wuarike_db.places pl ON pl.id = a.place_id
             WHERE a.status = 'RESERVADA' AND a.customer_phone IS NOT NULL AND a.starts_at > now() AND a.starts_at <= now() + interval '7 days'
               -- Solo números verificados: el que escribió por WhatsApp (bot), el que cargó el personal (panel) o, desde el
               -- link público, un número que ya le escribió antes al negocio. Así nadie usa el WhatsApp del local contra un tercero.
               AND (a.source IN ('BOT', 'PANEL') OR EXISTS (
                 SELECT 1 FROM wuarike_db.conversations c WHERE c.place_id = a.place_id AND regexp_replace(c.customer_phone, '\\D', '', 'g') = a.customer_phone))
               AND COALESCE(pl.metadata->'reminders'->>'enabled', 'true') <> 'false'
               -- Si el local tiene una campaña de recordatorio activa, esa reemplaza a este (no llegan dos).
               AND NOT EXISTS (SELECT 1 FROM wuarike_db.broadcasts b WHERE b.place_id = a.place_id AND b.kind = 'reminder' AND b.status = 'SCHEDULED')
             ORDER BY a.starts_at
             LIMIT 2000`,
        );
        const now = new Date();
        const dashboard = this.config.get<string>('DASHBOARD_URL') || 'https://admin.wuarikes.com';
        for (const a of rows) {
            const start = new Date(a.starts_at);
            const offset = dueOffset(start, new Date(a.created_at), normalizeOffsets(a.offsets), now, (a.sent ?? []).map(Number));
            if (offset === null) continue;
            if ((await this.templateStatus(a.place_id, 'reminder')) !== 'APPROVED') continue;
            // Reclamo: si dos instancias corren a la vez, solo una inserta y envía.
            const claimed = await this.dataSource.query(
                `INSERT INTO wuarike_db.appointment_reminders (appointment_id, offset_min) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING appointment_id`,
                [a.id, offset],
            );
            if (!claimed.length) continue;
            try {
                await this.sendSystemTemplate(a.place_id, 'reminder', a.customer_phone, [
                    safeName(a.customer_name), a.service_name, a.pro, dayLabel(limaDate(start)), timeLabel(limaTime(start)), a.place_name, `${dashboard}/reservar/cita/${a.public_token}`,
                ]);
            } catch (err) {
                this.logger.warn(`No se pudo enviar el recordatorio (${offset} min) de la cita ${a.id}: ${(err as Error).message}`);
            }
        }
    }

    private async metaNumber(placeId: string): Promise<WhatsAppNumber | null> {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        if (!isMetaEnabled(place)) return null;
        return this.numbersRepo.findOne({ where: { placeId, provider: 'meta', isActive: true }, order: { createdAt: 'DESC' } });
    }

    /** Estado y categoría con que Meta aprobó la plantilla (Meta puede pasar una UTILITY a MARKETING). */
    async templateInfo(placeId: string, key: TemplateKey): Promise<{ template: TemplateStatus; category: string | null }> {
        const template = await this.templateStatus(placeId, key, true);
        if (template === 'NO_WHATSAPP' || template === 'NOT_CREATED') return { template, category: null };
        const t = (await this.templates.list(placeId).catch(() => [])).find((x) => x.name === SYSTEM_TEMPLATES[key].name);
        return { template, category: t?.category ?? null };
    }

    async templateStatus(placeId: string, key: TemplateKey, fresh = false): Promise<TemplateStatus> {
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
