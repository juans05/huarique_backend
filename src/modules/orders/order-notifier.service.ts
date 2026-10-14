import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { Order } from './entities/order.entity';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { OrdersService } from './orders.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { WhatsAppSenderService } from '../messaging/whatsapp-sender.service';

const REVIEW_DELAY_MS = { SALA: 45 * 60_000, RECOJO: 2 * 3600_000, DELIVERY: 2 * 3600_000 } as const;

@Injectable()
export class OrderNotifierService {
    private readonly logger = new Logger(OrderNotifierService.name);

    constructor(
        @InjectRepository(Order) private ordersRepo: Repository<Order>,
        @InjectRepository(WhatsAppNumber) private waRepo: Repository<WhatsAppNumber>,
        private orders: OrdersService,
        private loyalty: LoyaltyService,
        private sender: WhatsAppSenderService,
        @InjectQueue('order-reviews') private reviews: Queue,
    ) { }

    @OnEvent('orders.payment.confirmed', { async: true })
    async onPaymentConfirmed(payload: { paymentId: string; placeId: string; orderIds: string[] }) {
        if (!payload.orderIds.length) return;
        const orders = await this.ordersRepo.find({ where: { id: In(payload.orderIds) } });
        const settings = await this.orders.getSettings(payload.placeId);
        const phones = new Set<string>();
        for (const order of orders) {
            if (!order.customerPhone) continue;
            if (!phones.has(order.customerPhone)) {
                phones.add(order.customerPhone);
                await this.loyalty.scan(order.placeId, order.customerPhone, order.customerName ?? undefined)
                    .catch((err) => this.logger.log(`Sin fidelización para ${order.placeId}: ${err?.message}`));
            }
            if (order.channel === 'WHATSAPP') {
                await this.send(order, `Pedido #${order.number} recibido y pagado. Estará listo en ~${settings.prepTimeMin} min.`);
            }
        }
    }

    @OnEvent('orders.status.changed', { async: true })
    async onStatusChanged(payload: { orderId: string; status: string }) {
        const order = await this.ordersRepo.findOne({ where: { id: payload.orderId } });
        if (!order?.customerPhone) return;
        if (order.channel === 'WHATSAPP' && payload.status === 'LISTO') {
            await this.send(order, order.fulfillment === 'DELIVERY' ? `Tu pedido #${order.number} ya salió.` : `Tu pedido #${order.number} está listo para recoger.`);
        }
        if (payload.status === 'ENTREGADO') {
            await this.reviews.add('review', { orderId: order.id }, { delay: REVIEW_DELAY_MS[order.fulfillment], jobId: `review-${order.id}`, removeOnComplete: true, removeOnFail: 100 });
        }
    }

    async send(order: Order, text: string) {
        const numberId = order.whatsappNumberId ?? (await this.waRepo.findOne({ where: { placeId: order.placeId, isActive: true } }))?.id ?? null;
        if (!numberId) return;
        await this.sender.sendText(numberId, order.customerPhone!, text)
            .catch((err) => this.logger.warn(`No se pudo avisar el pedido #${order.number}: ${err?.message}`));
    }
}
