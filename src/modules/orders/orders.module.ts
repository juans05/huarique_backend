import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceOrderSettings } from './entities/place-order-settings.entity';
import { PlaceTable } from './entities/place-table.entity';
import { Tab } from './entities/tab.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderPayment } from './entities/order-payment.entity';
import { PlacePayout } from './entities/place-payout.entity';
import { WhatsappOrderDraft } from './entities/whatsapp-order-draft.entity';
import { Dish } from '../places/entities/dish.entity';
import { Place } from '../places/entities/place.entity';
import { TeamModule } from '../team/team.module';
import { OrdersService } from './orders.service';
import { OrderSettingsService } from './order-settings.service';
import { PaymentsService } from './payments.service';
import { StaffOrdersController } from './staff-orders.controller';
import { OrdersStreamController } from './orders-stream.controller';
import { PublicOrdersController } from './public-orders.controller';
import { AuthModule } from '../auth/auth.module';
import { OrderEventsService } from './order-events.service';

export const ORDER_ENTITIES = [PlaceOrderSettings, PlaceTable, Tab, Order, OrderItem, OrderPayment, PlacePayout, WhatsappOrderDraft, Dish, Place];

@Module({
    imports: [TypeOrmModule.forFeature(ORDER_ENTITIES), TeamModule, AuthModule],
    controllers: [StaffOrdersController, OrdersStreamController, PublicOrdersController],
    providers: [OrderEventsService, OrdersService, OrderSettingsService, PaymentsService],
    exports: [OrderEventsService, OrdersService, OrderSettingsService, PaymentsService],
})
export class OrdersModule { }
