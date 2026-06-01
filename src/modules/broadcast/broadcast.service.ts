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

        broadcast.status = 'SENDING';
        await this.broadcastRepo.save(broadcast);

        const customers = await this.getCustomersForBroadcast(broadcast);

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

    @Cron(CronExpression.EVERY_MINUTE)
    async processScheduledBroadcasts() {
        const now = new Date();
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

    private async getCustomersForBroadcast(broadcast: Broadcast) {
        if (broadcast.useCsvMerge && broadcast.csvImportId) {
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
