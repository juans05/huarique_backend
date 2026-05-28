import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { EmailCampaign } from './entities/email-campaign.entity';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';

@Injectable()
export class EmailCampaignService {
    constructor(
        @InjectRepository(EmailCampaign)
        private campaignRepo: Repository<EmailCampaign>,
        @InjectQueue('email-broadcast')
        private emailQueue: Queue
    ) {}

    async create(dto: CreateEmailCampaignDto) {
        const campaign = this.campaignRepo.create({
            placeId: dto.placeId,
            campaignName: dto.campaignName,
            subject: dto.subject,
            bodyHtml: dto.bodyHtml,
            status: 'DRAFT',
        });
        return await this.campaignRepo.save(campaign);
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

        if (campaign.status !== 'DRAFT') {
            throw new Error(`Campaign ${campaignId} is not in DRAFT state`);
        }

        campaign.status = 'SENDING';
        await this.campaignRepo.save(campaign);

        const customers = await this.getCustomersWithConsent(campaign.placeId);

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
