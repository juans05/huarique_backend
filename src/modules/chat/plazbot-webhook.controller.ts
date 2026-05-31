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

    const { event, contact, message, channel, to, phone_number } = payload;

    this.logger.log(`[webhook] event="${event}" contact=${JSON.stringify(contact)} message=${JSON.stringify(message)} channel=${JSON.stringify(channel)} to="${to}" phone_number="${phone_number}"`);

    if (event !== 'message_received') {
      this.logger.log(`[webhook] Evento ignorado: "${event}" (se esperaba "message_received")`);
      return { status: 'ok' };
    }

    // PlazBot puede enviar el número destino en distintos campos según versión de API
    const destinationPhone: string =
      channel?.phone || channel?.number || to || phone_number || '';

    this.logger.log(`[webhook] Número destino resuelto: "${destinationPhone}" (channel.phone="${channel?.phone}" channel.number="${channel?.number}" to="${to}" phone_number="${phone_number}")`);

    if (!destinationPhone) {
      this.logger.warn(`[webhook] Sin número destino. Payload completo: ${JSON.stringify(payload)}`);
      return { status: 'ok' };
    }

    // Rutear al restaurante por número de WhatsApp registrado en wuarikes
    const waNumber = await this.whatsappNumberRepo.findOne({
      where: { phoneNumber: destinationPhone, isActive: true },
    });

    this.logger.log(`[webhook] Búsqueda en DB para "${destinationPhone}": ${waNumber ? `encontrado placeId=${waNumber.placeId}` : 'NO ENCONTRADO'}`);

    if (!waNumber) {
      this.logger.warn(`[webhook] Número "${destinationPhone}" no está registrado o no está activo en la DB`);
      return { status: 'ok' };
    }

    this.logger.log(`[webhook] Procesando mensaje para placeId=${waNumber.placeId} de ${contact?.name} (${contact?.phone}): "${message?.body}"`);

    try {
      await this.chatProcessor.processIncomingMessage(
        waNumber.placeId,
        { name: contact?.name || 'Cliente', phone: contact?.phone || '' },
        message?.body || '',
      );
      this.logger.log(`[webhook] Mensaje procesado correctamente para placeId=${waNumber.placeId}`);
    } catch (error) {
      this.logger.error(`[webhook] Error procesando mensaje para placeId=${waNumber.placeId}: ${error?.message}`, error?.stack);
    }

    return { status: 'ok' };
  }
}
