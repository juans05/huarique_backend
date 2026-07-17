import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailCampaign } from './entities/email-campaign.entity';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import { UpdateEmailCampaignDto } from './dto/update-email-campaign.dto';

@Injectable()
export class EmailCampaignService {
    private readonly logger = new Logger(EmailCampaignService.name);

    constructor(
        @InjectRepository(EmailCampaign)
        private campaignRepo: Repository<EmailCampaign>,
        @InjectQueue('email-broadcast')
        private emailQueue: Queue
    ) {}

    async create(dto: CreateEmailCampaignDto) {
        const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
        const isFuture = scheduledAt !== null && scheduledAt > new Date();

        const campaign = this.campaignRepo.create({
            placeId: dto.placeId,
            campaignName: dto.campaignName,
            subject: dto.subject,
            bodyHtml: dto.bodyHtml,
            scheduledAt,
            status: isFuture ? 'SCHEDULED' : 'DRAFT',
        });
        return await this.campaignRepo.save(campaign);
    }

    async update(id: string, dto: UpdateEmailCampaignDto) {
        const campaign = await this.findOne(id);
        if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
            throw new Error(`Campaign ${id} can only be edited while DRAFT or SCHEDULED`);
        }
        if (dto.campaignName !== undefined) campaign.campaignName = dto.campaignName;
        if (dto.subject !== undefined) campaign.subject = dto.subject;
        if (dto.bodyHtml !== undefined) campaign.bodyHtml = dto.bodyHtml;
        return await this.campaignRepo.save(campaign);
    }

    async remove(id: string) {
        const campaign = await this.findOne(id);
        if (campaign.status === 'SENDING') {
            throw new Error(`Campaign ${id} cannot be deleted while SENDING`);
        }
        await this.campaignRepo.remove(campaign);
        return { id, deleted: true };
    }

    async scheduleCampaign(id: string, scheduledAt: string) {
        const campaign = await this.findOne(id);
        campaign.scheduledAt = new Date(scheduledAt);
        campaign.status = 'SCHEDULED';
        return await this.campaignRepo.save(campaign);
    }

    async unscheduleCampaign(id: string) {
        const campaign = await this.findOne(id);
        if (campaign.status !== 'SCHEDULED') {
            throw new Error(`Campaign ${id} is not in SCHEDULED state`);
        }
        campaign.status = 'DRAFT';
        campaign.scheduledAt = null;
        return await this.campaignRepo.save(campaign);
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async processScheduledEmailCampaigns() {
        const now = new Date();
        const due = await this.campaignRepo.find({
            where: {
                status: 'SCHEDULED',
                scheduledAt: LessThanOrEqual(now),
            },
        });

        for (const campaign of due) {
            this.logger.log(`Auto-triggering scheduled email campaign ${campaign.id}`);
            try {
                await this.triggerSend(campaign.id);
            } catch (err) {
                this.logger.error(`Failed to trigger scheduled email campaign ${campaign.id}:`, err);
            }
        }
    }

    async findByPlace(placeId: string) {
        return await this.campaignRepo.find({
            where: { placeId },
            relations: ['place'],
            order: { createdAt: 'DESC' },
        });
    }

    async findOne(id: string) {
        const campaign = await this.campaignRepo.findOne({
            where: { id },
            relations: ['place'],
        });
        if (!campaign) throw new NotFoundException('Email campaign not found');
        return campaign;
    }

    async triggerSend(campaignId: string) {
        const campaign = await this.findOne(campaignId);

        if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
            throw new Error(`Campaign ${campaignId} is not in DRAFT or SCHEDULED state`);
        }

        const customers = await this.getCustomersWithConsent(campaign.placeId);

        campaign.status = 'SENDING';
        campaign.totalRecipients = customers.length;
        await this.campaignRepo.save(campaign);

        for (const customer of customers) {
            await this.emailQueue.add(
                'send-email',
                {
                    campaignId: campaign.id,
                    to: customer.customerContact,
                    subject: campaign.subject,
                    bodyHtml: campaign.bodyHtml,
                    customerName: customer.customerName,
                },
                {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 },
                }
            );
        }

        return {
            campaignId: campaign.id,
            status: 'SENDING',
            totalQueued: customers.length,
            message: `Email campaign enqueued for ${customers.length} customers`,
        };
    }

    async forceComplete(campaignId: string) {
        const campaign = await this.findOne(campaignId);
        if (campaign.status !== 'SENDING') {
            throw new Error(`Campaign ${campaignId} is not in SENDING state`);
        }
        campaign.status = 'COMPLETED';
        await this.campaignRepo.save(campaign);
        return campaign;
    }

    async getAudienceCount(placeId: string): Promise<{ audienceCount: number }> {
        const result = await this.campaignRepo.query(
            `SELECT COUNT(DISTINCT customer_contact)::int AS count
             FROM wuarike_db.public_feedback
             WHERE place_id = $1
               AND marketing_consent = TRUE
               AND customer_contact IS NOT NULL
               AND customer_contact LIKE '%@%'`,
            [placeId]
        );
        return { audienceCount: result[0]?.count ?? 0 };
    }

    private async getCustomersWithConsent(placeId: string) {
        return await this.campaignRepo.query(
            `SELECT DISTINCT ON (customer_contact) customer_name, customer_contact
             FROM wuarike_db.public_feedback
             WHERE place_id = $1
               AND marketing_consent = TRUE
               AND customer_contact IS NOT NULL
               AND customer_contact LIKE '%@%'
             ORDER BY customer_contact, created_at DESC`,
            [placeId]
        );
    }
}
