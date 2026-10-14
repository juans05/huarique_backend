import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Order } from './entities/order.entity';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { OrdersModule } from './orders.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { MessagingModule } from '../messaging/messaging.module';
import { OrderNotifierService } from './order-notifier.service';
import { OrderReviewProcessor } from './order-review.processor';

// Módulo aparte para no cerrar un ciclo: ChatModule → OrdersModule, y LoyaltyModule → WhatsAppModule → ChatModule.
@Module({
    imports: [TypeOrmModule.forFeature([Order, WhatsAppNumber]), OrdersModule, LoyaltyModule, MessagingModule, BullModule.registerQueue({ name: 'order-reviews' })],
    providers: [OrderNotifierService, OrderReviewProcessor],
})
export class OrdersNotificationsModule { }
