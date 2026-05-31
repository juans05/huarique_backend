import { Controller, Post, Body, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatProcessorService } from './chat-processor.service';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';

@Controller('webhooks/plazbot')
export class PlazBotWebhookController {
  private readonly logger = new Logger(PlazBotWebhookController.name);

  constructor(
    private chatProcessor: ChatProcessorService,
    @InjectRepository(WhatsAppNumber)
    private whatsappNumberRepo: Repository<WhatsAppNumber>,
  ) {}

  @Post()
  async handleWebhook(@Body() payload: any) {
    this.logger.log(`[webhook] Payload recibido: ${JSON.stringify(payload)}`);

    // Formato WhatsApp Business API (enviado por PlazBot)
    const entry = payload?.reference?.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    if (change) {
      const destinationPhone: string = change.metadata?.display_phone_number || '';
      const senderPhone: string = change.messages?.[0]?.from || payload.recipientPhone || '';
      const senderName: string = change.contacts?.[0]?.profile?.name || 'Cliente';
      const messageBody: string = change.messages?.[0]?.text?.body || payload.content || '';

      this.logger.log(`[webhook] Formato WhatsApp Business — destino="${destinationPhone}" remitente="${senderPhone}" nombre="${senderName}" mensaje="${messageBody}"`);

      if (!destinationPhone) {
        this.logger.warn(`[webhook] Sin número destino en metadata. Payload: ${JSON.stringify(payload)}`);
        return { status: 'ok' };
      }

      const waNumber = await this.whatsappNumberRepo.findOne({
        where: { phoneNumber: destinationPhone, isActive: true },
      });

      this.logger.log(`[webhook] Búsqueda en DB para "${destinationPhone}": ${waNumber ? `encontrado placeId=${waNumber.placeId}` : 'NO ENCONTRADO'}`);

      if (!waNumber) {
        this.logger.warn(`[webhook] Número "${destinationPhone}" no registrado o inactivo en DB`);
        return { status: 'ok' };
      }

      try {
        await this.chatProcessor.processIncomingMessage(
          waNumber.placeId,
          { name: senderName, phone: senderPhone },
          messageBody,
        );
        this.logger.log(`[webhook] Mensaje procesado para placeId=${waNumber.placeId}`);
      } catch (error) {
        this.logger.error(`[webhook] Error procesando mensaje: ${error?.message}`, error?.stack);
      }

      return { status: 'ok' };
    }

    // Formato legacy PlazBot { event, contact, message, channel }
    const { event, contact, message, channel, to, phone_number } = payload;

    if (event !== 'message_received') {
      this.logger.log(`[webhook] Evento ignorado: "${event}"`);
      return { status: 'ok' };
    }

    const destinationPhone: string = channel?.phone || channel?.number || to || phone_number || '';

    if (!destinationPhone) {
      this.logger.warn(`[webhook] Sin número destino. Payload: ${JSON.stringify(payload)}`);
      return { status: 'ok' };
    }

    const waNumber = await this.whatsappNumberRepo.findOne({
      where: { phoneNumber: destinationPhone, isActive: true },
    });

    if (!waNumber) {
      this.logger.warn(`[webhook] Número "${destinationPhone}" no registrado o inactivo en DB`);
      return { status: 'ok' };
    }

    try {
      await this.chatProcessor.processIncomingMessage(
        waNumber.placeId,
        { name: contact?.name || 'Cliente', phone: contact?.phone || '' },
        message?.body || '',
      );
      this.logger.log(`[webhook] Mensaje procesado para placeId=${waNumber.placeId}`);
    } catch (error) {
      this.logger.error(`[webhook] Error procesando mensaje: ${error?.message}`, error?.stack);
    }

    return { status: 'ok' };
  }
}
