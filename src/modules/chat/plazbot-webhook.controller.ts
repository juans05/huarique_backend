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
    const { event, contact, message, channel, to, phone_number } = payload;

    if (event !== 'message_received') {
      return { status: 'ok' };
    }

    // PlazBot puede enviar el número destino en distintos campos según versión de API
    const destinationPhone: string =
      channel?.phone || channel?.number || to || phone_number || '';

    if (!destinationPhone) {
      // Log completo del payload para diagnosticar el formato real de PlazBot
      this.logger.warn(
        `Webhook sin número destino. Payload: ${JSON.stringify(payload)}`,
      );
      return { status: 'ok' };
    }

    // Rutear al restaurante por número de WhatsApp registrado en wuarikes
    const waNumber = await this.whatsappNumberRepo.findOne({
      where: { phoneNumber: destinationPhone, isActive: true },
    });

    if (!waNumber) {
      this.logger.warn(`Número destino desconocido: ${destinationPhone}`);
      return { status: 'ok' };
    }

    try {
      await this.chatProcessor.processIncomingMessage(
        waNumber.placeId,
        { name: contact?.name || 'Cliente', phone: contact?.phone || '' },
        message?.body || '',
      );
    } catch (error) {
      this.logger.error(`Error procesando mensaje para place ${waNumber.placeId}:`, error);
    }

    return { status: 'ok' };
  }
}
