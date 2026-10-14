import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Order } from './entities/order.entity';
import { OrderNotifierService } from './order-notifier.service';

const REVIEW_COOLDOWN_MS = 30 * 24 * 3600_000;

@Processor('order-reviews')
export class OrderReviewProcessor extends WorkerHost {
    constructor(
        @InjectRepository(Order) private ordersRepo: Repository<Order>,
        private notifier: OrderNotifierService,
        private config: ConfigService,
    ) { super(); }

    async process(job: Job<{ orderId: string }>) {
        const order = await this.ordersRepo.findOne({ where: { id: job.data.orderId } });
        if (!order?.customerPhone || order.reviewRequestedAt) return;
        const recent = await this.ordersRepo.findOne({
            where: { placeId: order.placeId, customerPhone: order.customerPhone, reviewRequestedAt: MoreThan(new Date(Date.now() - REVIEW_COOLDOWN_MS)) },
        });
        if (recent) return;
        const dashboard = this.config.get<string>('DASHBOARD_URL') || 'https://admin.wuarikes.com';
        await this.notifier.send(order, `¡Gracias por tu visita! ¿Qué tal estuvo todo? Cuéntanos en 10 segundos: ${dashboard}/l/${order.placeId}`);
        await this.ordersRepo.update({ id: order.id }, { reviewRequestedAt: new Date() });
    }
}
