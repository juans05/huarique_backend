import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';
import { BroadcastProcessor } from './broadcast.processor';
import { Broadcast } from './entities/broadcast.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { Place } from '../places/entities/place.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CreditsModule } from '../credits/credits.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Broadcast, Contact, Place]),
        BullModule.registerQueue({
            name: 'whatsapp-broadcast'
        }),
        AuditLogModule,
        CreditsModule,
        WhatsAppModule,
        SubscriptionsModule,
    ],
    controllers: [BroadcastController],
    providers: [BroadcastService, BroadcastProcessor],
    exports: [BroadcastService, TypeOrmModule]
})
export class BroadcastModule {}
