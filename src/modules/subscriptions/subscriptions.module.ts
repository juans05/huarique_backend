import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { Subscription } from './entities/subscription.entity';
import { Payment } from './entities/payment.entity';
import { Place } from '../places/entities/place.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Subscription, Payment, Place])],
    controllers: [SubscriptionsController],
    providers: [SubscriptionsService],
    exports: [SubscriptionsService],
})
export class SubscriptionsModule { }
