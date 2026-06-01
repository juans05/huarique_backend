import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Broadcast } from './entities/broadcast.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreditsService } from '../credits/credits.service';

@Processor('whatsapp-broadcast')
export class BroadcastProcessor extends WorkerHost {
    constructor(
        @InjectRepository(Broadcast)
        private broadcastRepo: Repository<Broadcast>,
        @InjectRepository(Contact)
        private contactRepo: Repository<Contact>,
        private whatsappService: WhatsappService,
        private creditsService: CreditsService,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        const { broadcastId, customerPhone, customerName, contactId } = job.data;

        try {
            const broadcast = await this.broadcastRepo.findOne({
                where: { id: broadcastId },
                relations: ['whatsappNumber']
            });

            if (!broadcast || broadcast.status !== 'SENDING') {
                throw new Error(`Broadcast ${broadcastId} not found or not in SENDING state`);
            }

            let personalizedText = broadcast.templateBody;

            if (broadcast.useCsvMerge && contactId) {
                const contact = await this.contactRepo.findOne({ where: { id: contactId } });
                if (contact) {
                    personalizedText = this.applyMergeMapping(personalizedText, broadcast.mergeMapping, contact);
                } else {
                    personalizedText = personalizedText.replace(/\{(\w+)\}/g, customerName || 'Amigo');
                }
            } else {
                personalizedText = personalizedText.replace('{nombre}', customerName || 'Amigo');
            }

            await this.whatsappService.sendWhatsAppMessage(
                broadcast.whatsappNumber.phoneNumberId,
                broadcast.whatsappNumber.whatsappApiToken,
                customerPhone,
                personalizedText
            );

            broadcast.messagesSent += 1;
            await this.broadcastRepo.save(broadcast);

            await this.creditsService.deduct(
                broadcast.placeId,
                1,
                'broadcast',
                broadcastId,
                `Mensaje enviado a ${customerPhone}`,
            );

            console.log(`[Broadcast Sent] ${broadcastId} -> ${customerPhone}`);
            return { success: true, customerPhone };
        } catch (error) {
            console.error(`[Broadcast Job FAILED] ${broadcastId} for ${customerPhone}:`, error);
            throw error;
        }
    }

    private applyMergeMapping(template: string, mapping: any, contact: Contact): string {
        let result = template;

        if (mapping && typeof mapping === 'object') {
            for (const [placeholder, field] of Object.entries(mapping)) {
                const value = (contact as any)[field as string] || this.getNestedValue(contact.customFields, field as string) || '';
                result = result.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), String(value));
            }
        }

        result = result.replace(/\{nombre\}/g, contact.name || 'Amigo');
        result = result.replace(/\{name\}/g, contact.name || 'Amigo');

        return result;
    }

    private getNestedValue(obj: any, path: string): any {
        if (!obj || !path) return null;
        const keys = path.split('.');
        let current = obj;
        for (const key of keys) {
            if (current === null || current === undefined) return null;
            current = current[key];
        }
        return current;
    }
}
