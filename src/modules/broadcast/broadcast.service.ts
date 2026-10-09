import { Injectable, Logger } from '@nestjs/common';
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
    ) {}

    async createBroadcast(data: any) {
        const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
        const isFuture = scheduledAt && scheduledAt > new Date();

        const broadcast = this.broadcastRepo.create({
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
            scheduledAt: scheduledAt || null,
            timezone: data.timezone || 'America/Lima',
            status: isFuture ? 'SCHEDULED' : 'DRAFT',
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

    async updateBroadcast(id: string, data: any) {
        const broadcast = await this.broadcastRepo.findOne({ where: { id } });
        if (!broadcast) {
            throw new Error(`Broadcast ${id} not found`);
        }
        Object.assign(broadcast, {
            csvImportId: data.csvImportId ?? broadcast.csvImportId,
            useCsvMerge: data.useCsvMerge ?? broadcast.useCsvMerge,
            mergeMapping: data.mergeMapping ?? broadcast.mergeMapping,
            scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : broadcast.scheduledAt,
            timezone: data.timezone ?? broadcast.timezone,
        });
        return await this.broadcastRepo.save(broadcast);
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
            throw new Error(`Broadcast ${id} is not in SCHEDULED state`);
        }
        broadcast.status = 'DRAFT';
        broadcast.scheduledAt = null;
        const saved = await this.broadcastRepo.save(broadcast);
        await this.auditLogService.log({
            action: 'broadcast.cancelled',
            entityType: 'broadcast',
            entityId: saved.id,
            placeId: saved.placeId,
            description: `Campaña "${saved.campaignName}" cancelada`,
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
