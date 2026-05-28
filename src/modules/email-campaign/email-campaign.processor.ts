import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailCampaign } from './entities/email-campaign.entity';
import { MailService } from '../../common/services/mail.service';

@Processor('email-broadcast')
export class EmailCampaignProcessor extends WorkerHost {
    constructor(
        @InjectRepository(EmailCampaign)
        private campaignRepo: Repository<EmailCampaign>,
        private mailService: MailService
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        const { campaignId, to, subject, bodyHtml, customerName } = job.data;

        try {
            const campaign = await this.campaignRepo.findOne({
                where: { id: campaignId },
            });

            if (!campaign || campaign.status !== 'SENDING') {
                throw new Error(`Campaign ${campaignId} not found or not in SENDING state`);
            }

            const personalizedHtml = bodyHtml.replace(/\{nombre\}/g, customerName || 'Amigo');
            const personalizedSubject = subject.replace(/\{nombre\}/g, customerName || 'Amigo');

            await this.mailService.sendMarketingEmail(
                [to],
                personalizedSubject,
                personalizedHtml,
            );

            campaign.emailsSent += 1;
            await this.campaignRepo.save(campaign);

            console.log(`[Email Sent] ${campaignId} -> ${to}`);
            return { success: true, to };
        } catch (error) {
            console.error(`[Email Job FAILED] ${campaignId} for ${to}:`, error);
            throw error;
        }
    }
}
