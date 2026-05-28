import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';
import { BroadcastProcessor } from './broadcast.processor';
import { Broadcast } from './entities/broadcast.entity';
import { Place } from '../places/entities/place.entity';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Broadcast, Place]),
        BullModule.registerQueue({
            name: 'whatsapp-broadcast'
        }),
        WhatsAppModule
    ],
    controllers: [BroadcastController],
    providers: [BroadcastService, BroadcastProcessor],
    exports: [BroadcastService, TypeOrmModule]
})
export class BroadcastModule {}
