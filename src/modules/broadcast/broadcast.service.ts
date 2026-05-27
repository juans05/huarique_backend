import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Broadcast } from './entities/broadcast.entity';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';

@Injectable()
export class BroadcastService {
    constructor(
        @InjectRepository(Broadcast)
        private broadcastRepo: Repository<Broadcast>,
        @InjectRepository(WhatsAppNumber)
        private whatsappNumberRepo: Repository<WhatsAppNumber>,
        @InjectQueue('whatsapp-broadcast')
        private broadcastQueue: Queue
    ) {}

    async createBroadcast(data: any) {
        const broadcast = this.broadcastRepo.create({
            placeId: data.placeId,
            whatsappNumberId: data.whatsappNumberId,
            campaignName: data.campaignName,
            templateBody: data.templateBody,
            segmentFilter: data.segmentFilter || null,
            status: 'DRAFT'
        });
        return await this.broadcastRepo.save(broadcast);
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

        // Update status to SENDING
        broadcast.status = 'SENDING';
        await this.broadcastRepo.save(broadcast);

        // Fetch list of customers to send to (simplified)
        // In production, filter by segmentFilter (VIP, inactive, etc.)
        const customers = await this.getCustomersForSegment(broadcast.placeId, broadcast.segmentFilter);

        // Enqueue each customer message in BullMQ
        for (const customer of customers) {
            await this.broadcastQueue.add(
                'send-broadcast-message',
                {
                    broadcastId: broadcast.id,
                    customerPhone: customer.customerPhone,
                    customerName: customer.customerName
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

        return {
            broadcastId,
            status: 'SENDING',
            totalQueued: customers.length,
            message: `Campaign enqueued for ${customers.length} customers`
        };
    }

    private async getCustomersForSegment(placeId: string, segmentFilter: any) {
        // Simplified: fetch all unique customers who have talked to this place
        const result = await this.broadcastRepo.query(
            `SELECT DISTINCT customer_phone, customer_name
             FROM conversations
             WHERE place_id = $1`,
            [placeId]
        );
        return result;
    }
}
