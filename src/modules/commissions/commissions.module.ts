import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionsService } from './commissions.service';
import { CommissionSettings } from './entities/commission-settings.entity';
import { CommissionEntry } from './entities/commission-entry.entity';
import { CommissionPayout } from './entities/commission-payout.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Payment } from '../subscriptions/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([CommissionSettings, CommissionEntry, CommissionPayout, Subscription, Payment, User]),
        AuditLogModule,
    ],
    providers: [CommissionsService],
    exports: [CommissionsService],
})
export class CommissionsModule {}
