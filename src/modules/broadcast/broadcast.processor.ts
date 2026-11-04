import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Broadcast } from './entities/broadcast.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { chargesCredits, CreditsService } from '../credits/credits.service';
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

            // Todo sale por la API de WhatsApp de Facebook con una plantilla aprobada.
            if (!isMetaEnabled(broadcast.place) || broadcast.whatsappNumber.provider !== 'meta' || !broadcast.templateName) {
                throw new Error(`Broadcast ${broadcastId}: el número no está conectado con Facebook o falta la plantilla`);
            }
            let contactName = customerName as string | undefined;
            if (broadcast.useCsvMerge && contactId) {
                contactName = (await this.contactRepo.findOne({ where: { id: contactId } }))?.name ?? contactName;
            }
            const values = renderVariables(broadcast.bodyVariables, { name: contactName });
            // Se cobra ANTES de enviar: el chequeo de saldo al lanzar no reserva nada, así que dos campañas
            // simultáneas pasarían ambas. Sin saldo, el mensaje no sale.
            const paid = chargesCredits(broadcast.whatsappNumber);
            const charged = !paid || await this.creditsService.deductIfEnough(broadcast.placeId, 1, 'broadcast', broadcastId, `Mensaje enviado a ${customerPhone}`);
            if (!charged) {
                console.warn(`[Broadcast] ${broadcastId}: sin saldo, no se envía a ${customerPhone}`);
                await this.broadcastService.recordResult(broadcastId, false);
                return { success: false, customerPhone };
            }
            try {
                await this.cloud.sendTemplate(broadcast.whatsappNumber, customerPhone, broadcast.templateName, broadcast.templateLanguage, buildBodyComponents(values));
            } catch (err) {
                // El envío falló: se devuelve el crédito (el reintento de BullMQ vuelve a cobrar).
                if (paid) await this.creditsService.add(broadcast.placeId, 1, 'refund', `Devolución: falló el envío a ${customerPhone}`);
                throw err;
            }
            await this.broadcastService.recordResult(broadcastId, true);
            console.log(`[Broadcast Sent] ${broadcastId} -> ${customerPhone}`);
            return { success: true, customerPhone };
        } catch (error) {
            console.error(`[Broadcast Job FAILED] ${broadcastId} for ${customerPhone}:`, error);
            throw error;
        }
    }

    // Cuenta los fallos definitivos (después de los reintentos) para cerrar la campaña.
    @OnWorkerEvent('failed')
    async onFailed(job: Job | undefined) {
        if (!job?.data?.broadcastId) return;
        if (job.attemptsMade < (job.opts?.attempts ?? 1)) return;
        const b = await this.broadcastRepo.findOne({ where: { id: job.data.broadcastId }, relations: ['place', 'whatsappNumber'] });
        if (b && b.totalRecipients > 0 && isMetaEnabled(b.place) && b.whatsappNumber?.provider === 'meta') {
            await this.broadcastService.recordResult(b.id, false);
        }
    }
}
