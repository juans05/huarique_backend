import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Broadcast } from './entities/broadcast.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Processor('whatsapp-broadcast')
export class BroadcastProcessor extends WorkerHost {
    constructor(
        @InjectRepository(Broadcast)
        private broadcastRepo: Repository<Broadcast>,
        private whatsappService: WhatsappService
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        const { broadcastId, customerPhone, customerName } = job.data;

        try {
            // Fetch broadcast record
            const broadcast = await this.broadcastRepo.findOne({
                where: { id: broadcastId },
                relations: ['whatsappNumber']
            });

            if (!broadcast || broadcast.status !== 'SENDING') {
                throw new Error(`Broadcast ${broadcastId} not found or not in SENDING state`);
            }

            // Replace template variables (e.g., {nombre})
            const personalizedText = broadcast.templateBody.replace('{nombre}', customerName || 'Amigo');

            // Send message via WhatsApp API
            await this.whatsappService.sendWhatsAppMessage(
                broadcast.whatsappNumber.phoneNumberId,
                broadcast.whatsappNumber.whatsappApiToken,
                customerPhone,
                personalizedText
            );

            // Increment counter
            broadcast.messagesSent += 1;
            await this.broadcastRepo.save(broadcast);

            console.log(`[Broadcast Sent] ${broadcastId} -> ${customerPhone}`);
            return { success: true, customerPhone };
        } catch (error) {
            console.error(`[Broadcast Job FAILED] ${broadcastId} for ${customerPhone}:`, error);
            throw error; // BullMQ will retry based on retry config
        }
    }
}
