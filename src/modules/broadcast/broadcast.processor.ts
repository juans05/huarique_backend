import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Broadcast } from './entities/broadcast.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreditsService } from '../credits/credits.service';
import { BroadcastService } from './broadcast.service';
import { WhatsAppCloudService, buildBodyComponents } from '../messaging/whatsapp-cloud.service';
import { renderVariables } from '../messaging/whatsapp-templates.util';
import { isMetaEnabled } from '../messaging/meta-flag';

@Processor('whatsapp-broadcast')
export class BroadcastProcessor extends WorkerHost {
    constructor(
        @InjectRepository(Broadcast)
        private broadcastRepo: Repository<Broadcast>,
        @InjectRepository(Contact)
        private contactRepo: Repository<Contact>,
        private whatsappService: WhatsappService,
        private creditsService: CreditsService,
        private broadcastService: BroadcastService,
        private cloud: WhatsAppCloudService,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        const { broadcastId, customerPhone, customerName, contactId } = job.data;

        try {
            const broadcast = await this.broadcastRepo.findOne({
                where: { id: broadcastId },
                relations: ['whatsappNumber', 'place']
            });

            if (!broadcast || broadcast.status !== 'SENDING') {
                throw new Error(`Broadcast ${broadcastId} not found or not in SENDING state`);
            }

            // FLUJO META (con el flag del local): plantilla aprobada por la API de WhatsApp Cloud.
            if (isMetaEnabled(broadcast.place) && broadcast.whatsappNumber.provider === 'meta' && broadcast.templateName) {
                let contactName = customerName as string | undefined;
                if (broadcast.useCsvMerge && contactId) {
                    contactName = (await this.contactRepo.findOne({ where: { id: contactId } }))?.name ?? contactName;
                }
                const values = renderVariables(broadcast.bodyVariables, { name: contactName });
                // Se cobra ANTES de enviar: el chequeo de saldo al lanzar no reserva nada, así que dos campañas
                // simultáneas pasarían ambas. Sin saldo, el mensaje no sale.
                const charged = await this.creditsService.deductIfEnough(broadcast.placeId, 1, 'broadcast', broadcastId, `Mensaje enviado a ${customerPhone}`);
                if (!charged) {
                    console.warn(`[Broadcast] ${broadcastId}: sin saldo, no se envía a ${customerPhone}`);
                    await this.broadcastService.recordResult(broadcastId, false);
                    return { success: false, customerPhone };
                }
                try {
                    await this.cloud.sendTemplate(broadcast.whatsappNumber, customerPhone, broadcast.templateName, broadcast.templateLanguage, buildBodyComponents(values));
                } catch (err) {
                    // El envío falló: se devuelve el crédito (el reintento de BullMQ vuelve a cobrar).
                    await this.creditsService.add(broadcast.placeId, 1, 'refund', `Devolución: falló el envío a ${customerPhone}`);
                    throw err;
                }
                await this.broadcastService.recordResult(broadcastId, true);
                return { success: true, customerPhone };
            } else {
                // FLUJO ANTERIOR (PlazBot / sin flag): igual que antes.
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
            }

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

    // Solo el flujo Meta cuenta los fallos (las campañas anteriores no llevan total ni cierre automático).
    @OnWorkerEvent('failed')
    async onFailed(job: Job | undefined) {
        if (!job?.data?.broadcastId) return;
        if (job.attemptsMade < (job.opts?.attempts ?? 1)) return;
        const b = await this.broadcastRepo.findOne({ where: { id: job.data.broadcastId }, relations: ['place', 'whatsappNumber'] });
        if (b && b.totalRecipients > 0 && isMetaEnabled(b.place) && b.whatsappNumber?.provider === 'meta') {
            await this.broadcastService.recordResult(b.id, false);
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
