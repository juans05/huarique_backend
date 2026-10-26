import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Broadcast } from './entities/broadcast.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { dedupeRecipients, finalStatus } from '../messaging/whatsapp-templates.util';
import { isMetaEnabled } from '../messaging/meta-flag';
import { LoyaltyCard } from '../loyalty/entities/loyalty-card.entity';
import { segmentRecipients } from './broadcast-segment.util';
import { CreditsService } from '../credits/credits.service';
import { Place } from '../places/entities/place.entity';
import { WhatsAppCloudService, buildBodyComponents } from '../messaging/whatsapp-cloud.service';
import { dayLabel, limaDate, limaTime, timeLabel } from '../appointments/appointments.rules';
import { safeName } from '../appointments/reminders.service';
import { REMINDER_MAX_OFFSET, REMINDER_MIN_OFFSET, allowsReminderCampaign, renderReminderVariables, validOffset } from './broadcast-reminder.util';

/** Estados en los que una campaña masiva todavía se puede editar (después ya salió). */
const EDITABLE_MASS = ['DRAFT', 'SCHEDULED'];

@Injectable()
export class BroadcastService {
    private readonly logger = new Logger(BroadcastService.name);

    constructor(
        @InjectRepository(Broadcast)
        private broadcastRepo: Repository<Broadcast>,
        @InjectRepository(Contact)
        private contactRepo: Repository<Contact>,
        @InjectRepository(WhatsAppNumber)
        private whatsappNumberRepo: Repository<WhatsAppNumber>,
        @InjectRepository(LoyaltyCard)
        private loyaltyCardRepo: Repository<LoyaltyCard>,
        private creditsService: CreditsService,
        @InjectQueue('whatsapp-broadcast')
        private broadcastQueue: Queue,
        private auditLogService: AuditLogService,
        private cloud: WhatsAppCloudService,
    ) {}

    private running = false;

    /** Campaña de recordatorio: solo rubros de belleza, con plantilla de Meta y un tiempo válido. */
    private async assertReminder(placeId: string, offset: unknown, templateName: string | null | undefined) {
        const place = await this.broadcastRepo.manager.getRepository(Place).findOne({ where: { id: placeId } });
        if (!allowsReminderCampaign(place?.businessType)) {
            throw new BadRequestException('Las campañas de recordatorio de cita son para barberías, peluquerías y spas.');
        }
        if (!validOffset(offset)) {
            throw new BadRequestException(`Elige cuándo enviar el recordatorio: entre ${REMINDER_MIN_OFFSET} minutos y ${REMINDER_MAX_OFFSET / 1440} días antes de la cita.`);
        }
        if (!templateName) throw new BadRequestException('Elige una plantilla aprobada de WhatsApp para el recordatorio.');
    }

    private async assertNumber(placeId: string, whatsappNumberId: string) {
        const number = await this.whatsappNumberRepo.findOne({ where: { id: whatsappNumberId } });
        if (!number || number.placeId !== placeId) {
            throw new BadRequestException('El número de WhatsApp no pertenece a este local.');
        }
        return number;
    }

    async createBroadcast(data: any) {
        const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
        const isFuture = scheduledAt && scheduledAt > new Date();

        // El controlador valida el acceso a placeId, no al número: sin esto se podría enviar desde el número de otro local.
        await this.assertNumber(data.placeId, data.whatsappNumberId);
        const kind = data.kind === 'reminder' ? 'reminder' : 'mass';
        if (kind === 'reminder') await this.assertReminder(data.placeId, data.reminderOffsetMin, data.templateName);

        const broadcast = this.broadcastRepo.create({
            kind,
            reminderOffsetMin: kind === 'reminder' ? data.reminderOffsetMin : null,
            placeId: data.placeId,
            whatsappNumberId: data.whatsappNumberId,
            campaignName: data.campaignName,
            templateBody: data.templateBody,
            templateName: data.templateName || null,
            templateLanguage: data.templateLanguage || 'es',
            bodyVariables: Array.isArray(data.bodyVariables) ? data.bodyVariables.map(String) : null,
            segmentFilter: data.segmentFilter || null,
            csvImportId: data.csvImportId || null,
            useCsvMerge: data.useCsvMerge || false,
            mergeMapping: data.mergeMapping || null,
            scheduledAt: kind === 'reminder' ? null : scheduledAt || null,
            timezone: data.timezone || 'America/Lima',
            // El recordatorio nace pausado: se activa desde la lista, como se envía una campaña.
            status: kind === 'mass' && isFuture ? 'SCHEDULED' : 'DRAFT',
        });
        const saved = await this.broadcastRepo.save(broadcast);
        await this.auditLogService.log({
            action: isFuture ? 'broadcast.scheduled' : 'broadcast.created',
            entityType: 'broadcast',
            entityId: saved.id,
            placeId: saved.placeId,
            metadata: { campaignName: saved.campaignName, scheduledAt: saved.scheduledAt },
            description: `Campaña "${saved.campaignName}" creada`,
        });
        return saved;
    }

    async getBroadcastsByPlace(placeId: string) {
        return await this.broadcastRepo.find({
            where: { placeId },
            relations: ['whatsappNumber', 'place'],
            order: { createdAt: 'DESC' }
        });
    }

    async getBroadcast(broadcastId: string) {
        return await this.broadcastRepo.findOne({
            where: { id: broadcastId },
            relations: ['whatsappNumber', 'place']
        });
    }

    async triggerBroadcast(broadcastId: string) {
        const broadcast = await this.broadcastRepo.findOne({
            where: { id: broadcastId },
            relations: ['whatsappNumber', 'place']
        });

        if (!broadcast) {
            throw new Error(`Broadcast ${broadcastId} not found`);
        }

        if (broadcast.kind === 'reminder') return this.activateReminder(broadcast);

        // FLUJO META: solo si el local activó el canal de Facebook Y el número es de Meta. Cualquier otro caso
        // sigue exactamente por el flujo anterior (más abajo), sin cambios.
        const metaFlow = isMetaEnabled(broadcast.place) && broadcast.whatsappNumber?.provider === 'meta';

        let customers: { phone?: string | null; name?: string | null; contactId?: string | null }[];
        if (metaFlow) {
            if (!broadcast.whatsappNumber.isActive) throw new Error('El número de WhatsApp de esta campaña no está activo.');
            // Por la API de Meta solo se puede escribir primero con una plantilla aprobada: sin ella fallaría casi todo.
            if (!broadcast.templateName) throw new Error('Elige una plantilla aprobada de WhatsApp para enviar esta campaña.');
            if (broadcast.status === 'SENDING' || broadcast.status === 'COMPLETED') {
                throw new Error(`La campaña ya está en estado ${broadcast.status}.`);
            }
            // Segmento (solo flujo Meta): VIP = tiene tarjeta de fidelización del local; normal = no la tiene.
            const cards = await this.loyaltyCardRepo.find({ where: { placeId: broadcast.placeId } });
            const filter = broadcast.segmentFilter ?? {};
            if (filter.type === 'excel' && !broadcast.csvImportId) throw new Error('Elige la lista de Excel a la que quieres enviar.');
            customers = dedupeRecipients<{ phone?: string | null; name?: string | null; contactId?: string | null }>(
                segmentRecipients(filter, await this.getCustomersForBroadcast(broadcast, filter.type === 'excel'), cards),
            );
            // Cada mensaje cuesta 1 crédito: si no alcanza, la campaña no sale (el saldo nunca queda en negativo).
            const balance = await this.creditsService.getBalance(broadcast.placeId);
            if (balance.balance < customers.length) {
                throw new Error(`Créditos insuficientes: la campaña llega a ${customers.length} personas y tienes ${balance.balance} créditos.`);
            }
            broadcast.status = customers.length === 0 ? 'FAILED' : 'SENDING';
            broadcast.totalRecipients = customers.length;
            broadcast.messagesSent = 0;
            broadcast.messagesFailed = 0;
            await this.broadcastRepo.save(broadcast);
        } else {
            // FLUJO ANTERIOR (PlazBot / sin flag): igual que antes.
            broadcast.status = 'SENDING';
            await this.broadcastRepo.save(broadcast);
            customers = await this.getCustomersForBroadcast(broadcast);
        }

        for (const customer of customers) {
            await this.broadcastQueue.add(
                'send-broadcast-message',
                {
                    broadcastId: broadcast.id,
                    customerPhone: customer.phone,
                    customerName: customer.name,
                    contactId: customer.contactId,
                },
                {
                    delay: 0,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 2000
                    }
                }
            );
        }

        await this.auditLogService.log({
            action: 'broadcast.sent',
            entityType: 'broadcast',
            entityId: broadcast.id,
            placeId: broadcast.placeId,
            metadata: { totalQueued: customers.length, campaignName: broadcast.campaignName },
            description: `Campaña "${broadcast.campaignName}" enviada a ${customers.length} contactos`,
        });

        return {
            broadcastId,
            status: 'SENDING',
            totalQueued: customers.length,
            message: `Campaign enqueued for ${customers.length} customers`
        };
    }

    /**
     * Edita la campaña. Una masiva solo mientras no salió (borrador o programada); un recordatorio siempre, porque
     * los cambios aplican a los próximos envíos.
     */
    async updateBroadcast(id: string, data: any) {
        const broadcast = await this.broadcastRepo.findOne({ where: { id } });
        if (!broadcast) throw new NotFoundException('Campaña no encontrada');
        if (broadcast.kind === 'mass' && !EDITABLE_MASS.includes(broadcast.status)) {
            throw new BadRequestException('Esta campaña ya se envió: no se puede editar. Crea una nueva.');
        }
        if (data.whatsappNumberId && data.whatsappNumberId !== broadcast.whatsappNumberId) {
            await this.assertNumber(broadcast.placeId, data.whatsappNumberId);
        }
        const pick = <T>(v: T | undefined, current: T) => (v === undefined ? current : v);
        Object.assign(broadcast, {
            campaignName: pick(data.campaignName, broadcast.campaignName),
            whatsappNumberId: pick(data.whatsappNumberId, broadcast.whatsappNumberId),
            templateBody: pick(data.templateBody, broadcast.templateBody),
            templateName: pick(data.templateName, broadcast.templateName),
            templateLanguage: pick(data.templateLanguage, broadcast.templateLanguage),
            bodyVariables: Array.isArray(data.bodyVariables) ? data.bodyVariables.map(String) : broadcast.bodyVariables,
            segmentFilter: pick(data.segmentFilter, broadcast.segmentFilter),
            csvImportId: pick(data.csvImportId, broadcast.csvImportId),
            useCsvMerge: pick(data.useCsvMerge, broadcast.useCsvMerge),
            mergeMapping: pick(data.mergeMapping, broadcast.mergeMapping),
            timezone: pick(data.timezone, broadcast.timezone),
            reminderOffsetMin: broadcast.kind === 'reminder' ? pick(data.reminderOffsetMin, broadcast.reminderOffsetMin) : null,
        });
        if (broadcast.kind === 'reminder') {
            await this.assertReminder(broadcast.placeId, broadcast.reminderOffsetMin, broadcast.templateName);
        } else if (data.scheduledAt !== undefined) {
            // Programar a futuro la deja SCHEDULED; quitar la fecha la devuelve a borrador.
            broadcast.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
            broadcast.status = broadcast.scheduledAt && broadcast.scheduledAt > new Date() ? 'SCHEDULED' : 'DRAFT';
        }
        const saved = await this.broadcastRepo.save(broadcast);
        await this.auditLogService.log({
            action: 'broadcast.updated', entityType: 'broadcast', entityId: saved.id, placeId: saved.placeId,
            description: `Campaña "${saved.campaignName}" editada`,
        });
        return saved;
    }

    // ── Campaña de recordatorio de cita ──────────────────────────────────

    private async activateReminder(broadcast: Broadcast) {
        await this.assertReminder(broadcast.placeId, broadcast.reminderOffsetMin, broadcast.templateName);
        if (broadcast.whatsappNumber?.provider !== 'meta' || !broadcast.whatsappNumber.isActive || !isMetaEnabled(broadcast.place)) {
            throw new BadRequestException('El recordatorio necesita un número de WhatsApp conectado con Facebook y activo.');
        }
        broadcast.status = 'SCHEDULED';
        await this.broadcastRepo.save(broadcast);
        await this.auditLogService.log({
            action: 'broadcast.reminder.activated', entityType: 'broadcast', entityId: broadcast.id, placeId: broadcast.placeId,
            description: `Recordatorio "${broadcast.campaignName}" activado (${broadcast.reminderOffsetMin} min antes)`,
        });
        return { broadcastId: broadcast.id, status: 'SCHEDULED', totalQueued: 0, message: 'Recordatorio activado' };
    }

    /** Últimos envíos de un recordatorio, para la vista de la campaña. */
    async reminderSends(broadcastId: string) {
        return this.broadcastRepo.query(
            `SELECT s.sent_at AS "sentAt", s.ok, a.customer_name AS "customerName", a.service_name AS "serviceName", a.starts_at AS "startsAt"
             FROM wuarike_db.broadcast_reminder_sends s
             LEFT JOIN wuarike_db.appointments a ON a.id = s.appointment_id
             WHERE s.broadcast_id = $1 ORDER BY s.sent_at DESC LIMIT 50`,
            [broadcastId],
        );
    }

    /**
     * Cada 5 min: por cada recordatorio activo, las citas reservadas que entran en su ventana (faltan ≤ X min). Se
     * salta la cita creada después de la hora en que tocaba avisar (quien reserva para dentro de 20 min no necesita
     * recordatorio de 1 h) y los teléfonos no verificados, igual que los recordatorios del sistema.
     */
    @Cron('*/5 * * * *')
    async processReminderCampaigns() {
        if (this.running) return;
        this.running = true;
        try {
            const active = await this.broadcastRepo.find({ where: { kind: 'reminder', status: 'SCHEDULED' }, relations: ['whatsappNumber', 'place'] });
            for (const b of active) {
                try {
                    await this.sendDueReminders(b);
                } catch (err) {
                    this.logger.error(`Recordatorio ${b.id}: ${(err as Error).message}`);
                }
            }
        } finally {
            this.running = false;
        }
    }

    private async sendDueReminders(b: Broadcast) {
        if (!b.templateName || !b.reminderOffsetMin || b.whatsappNumber?.provider !== 'meta' || !b.whatsappNumber.isActive || !isMetaEnabled(b.place)) return;
        const due: any[] = await this.broadcastRepo.query(
            `SELECT a.id, a.customer_name, a.customer_phone, a.service_name, a.starts_at, a.public_token, p.name AS pro
             FROM wuarike_db.appointments a
             LEFT JOIN wuarike_db.place_professionals p ON p.id = a.professional_id
             WHERE a.place_id = $1 AND a.status = 'RESERVADA' AND a.customer_phone IS NOT NULL
               AND a.starts_at > now() AND a.starts_at <= now() + make_interval(mins => $2)
               AND a.created_at < a.starts_at - make_interval(mins => $2)
               AND (a.source IN ('BOT', 'PANEL') OR EXISTS (
                 SELECT 1 FROM wuarike_db.conversations c WHERE c.place_id = a.place_id AND regexp_replace(c.customer_phone, '\\D', '', 'g') = a.customer_phone))
               AND NOT EXISTS (SELECT 1 FROM wuarike_db.broadcast_reminder_sends s WHERE s.broadcast_id = $3 AND s.appointment_id = a.id)
             ORDER BY a.starts_at LIMIT 200`,
            [b.placeId, b.reminderOffsetMin, b.id],
        );
        const dashboard = process.env.DASHBOARD_URL || 'https://admin.wuarikes.com';
        for (const a of due) {
            // Reclamo: si dos instancias corren a la vez, solo una envía.
            const claimed = await this.broadcastRepo.query(
                `INSERT INTO wuarike_db.broadcast_reminder_sends (broadcast_id, appointment_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING appointment_id`,
                [b.id, a.id],
            );
            if (!claimed.length) continue;
            const ok = await this.sendReminder(b, a, dashboard);
            await this.broadcastRepo.query(`UPDATE wuarike_db.broadcast_reminder_sends SET ok = $3 WHERE broadcast_id = $1 AND appointment_id = $2`, [b.id, a.id, ok]);
            await this.broadcastRepo.query(
                `UPDATE wuarike_db.broadcasts SET ${ok ? 'messages_sent = messages_sent + 1' : 'messages_failed = messages_failed + 1'}, total_recipients = total_recipients + 1 WHERE id = $1`,
                [b.id],
            );
        }
    }

    private async sendReminder(b: Broadcast, a: any, dashboard: string): Promise<boolean> {
        const start = new Date(a.starts_at);
        const values = renderReminderVariables(b.bodyVariables, {
            name: safeName(a.customer_name), service: a.service_name, professional: a.pro ?? 'nuestro equipo',
            date: dayLabel(limaDate(start)), time: timeLabel(limaTime(start)), place: b.place.name,
            link: `${dashboard}/reservar/cita/${a.public_token}`,
        });
        // Igual que una campaña: 1 crédito por mensaje, cobrado antes y devuelto si Meta lo rechaza.
        const charged = await this.creditsService.deductIfEnough(b.placeId, 1, 'broadcast', b.id, `Recordatorio a ${a.customer_phone}`);
        if (!charged) {
            this.logger.warn(`Recordatorio ${b.id}: sin créditos, no se envía a la cita ${a.id}`);
            return false;
        }
        try {
            await this.cloud.sendTemplate(b.whatsappNumber, a.customer_phone, b.templateName!, b.templateLanguage, buildBodyComponents(values));
            return true;
        } catch (err) {
            await this.creditsService.add(b.placeId, 1, 'refund', `Devolución: falló el recordatorio a ${a.customer_phone}`);
            this.logger.warn(`Recordatorio ${b.id}, cita ${a.id}: ${(err as Error).message}`);
            return false;
        }
    }

    async scheduleBroadcast(id: string, scheduledAt: string) {
        const broadcast = await this.broadcastRepo.findOne({ where: { id } });
        if (!broadcast) {
            throw new Error(`Broadcast ${id} not found`);
        }
        broadcast.scheduledAt = new Date(scheduledAt);
        broadcast.status = 'SCHEDULED';
        const saved = await this.broadcastRepo.save(broadcast);
        await this.auditLogService.log({
            action: 'broadcast.scheduled',
            entityType: 'broadcast',
            entityId: saved.id,
            placeId: saved.placeId,
            metadata: { scheduledAt: saved.scheduledAt },
            description: `Campaña "${saved.campaignName}" programada para ${saved.scheduledAt}`,
        });
        return saved;
    }

    async cancelBroadcast(id: string) {
        const broadcast = await this.broadcastRepo.findOne({ where: { id } });
        if (!broadcast) {
            throw new Error(`Broadcast ${id} not found`);
        }
        if (broadcast.status !== 'SCHEDULED') {
            throw new BadRequestException(broadcast.kind === 'reminder' ? 'El recordatorio ya está pausado.' : 'La campaña no está programada.');
        }
        broadcast.status = 'DRAFT';
        broadcast.scheduledAt = null;
        const saved = await this.broadcastRepo.save(broadcast);
        await this.auditLogService.log({
            action: 'broadcast.cancelled',
            entityType: 'broadcast',
            entityId: saved.id,
            placeId: saved.placeId,
            description: `Campaña "${saved.campaignName}" ${saved.kind === 'reminder' ? 'pausada' : 'cancelada'}`,
        });
        return saved;
    }

    /** Suma un resultado (enviado o fallido) sin pisar los demás y cierra la campaña cuando llegaron todos. */
    async recordResult(broadcastId: string, ok: boolean) {
        await this.broadcastRepo
            .createQueryBuilder()
            .update(Broadcast)
            .set(ok ? { messagesSent: () => 'messages_sent + 1' } : { messagesFailed: () => 'messages_failed + 1' })
            .where('id = :id', { id: broadcastId })
            .execute();
        const b = await this.broadcastRepo.findOne({ where: { id: broadcastId } });
        if (!b || b.status !== 'SENDING') return;
        const done = finalStatus(b.messagesSent, b.messagesFailed, b.totalRecipients);
        if (done) {
            // Solo pasa de SENDING a final una vez, aunque dos mensajes terminen a la vez.
            await this.broadcastRepo.update({ id: broadcastId, status: 'SENDING' }, { status: done });
        }
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async processScheduledBroadcasts() {
        const now = new Date();
        // Red de seguridad: una campaña que lleva horas "enviando" se cierra con lo que alcanzó a enviarse.
        const stale = await this.broadcastRepo.find({ where: { status: 'SENDING' } });
        for (const b of stale) {
            if (Date.now() - new Date(b.createdAt).getTime() > 6 * 3600 * 1000 && b.totalRecipients > 0) {
                await this.broadcastRepo.update({ id: b.id, status: 'SENDING' }, { status: b.messagesSent > 0 ? 'COMPLETED' : 'FAILED' });
            }
        }
        const due = await this.broadcastRepo.find({
            where: {
                kind: 'mass',
                status: 'SCHEDULED',
                scheduledAt: LessThanOrEqual(now),
            },
            relations: ['whatsappNumber', 'place'],
        });

        for (const broadcast of due) {
            this.logger.log(`Auto-triggering scheduled broadcast ${broadcast.id}`);
            try {
                await this.triggerBroadcast(broadcast.id);
            } catch (err) {
                this.logger.error(`Failed to trigger scheduled broadcast ${broadcast.id}:`, err);
            }
        }
    }

    private async getCustomersForBroadcast(broadcast: Broadcast, forceCsv = false) {
        if ((broadcast.useCsvMerge || forceCsv) && broadcast.csvImportId) {
            const contacts = await this.contactRepo.find({
                where: {
                    placeId: broadcast.placeId,
                    importBatchId: broadcast.csvImportId,
                },
            });
            return contacts.map(c => ({
                phone: c.phone,
                name: c.name,
                contactId: c.id,
            })).filter(c => c.phone);
        }

        const result = await this.broadcastRepo.query(
            `SELECT DISTINCT customer_phone, customer_name
             FROM conversations
             WHERE place_id = $1`,
            [broadcast.placeId]
        );
        return result.map((r: any) => ({
            phone: r.customer_phone,
            name: r.customer_name,
            contactId: null,
        }));
    }
}
