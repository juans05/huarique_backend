import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { Contact } from './entities/contact.entity';
import { ContactImport } from './entities/contact-import.entity';
import { Place } from '../places/entities/place.entity';
import { Order } from '../orders/entities/order.entity';
import { Conversation } from '../whatsapp/entities/conversation.entity';
import { LoyaltyCard } from '../loyalty/entities/loyalty-card.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
    imports: [
        // Order, Conversation y LoyaltyCard solo se leen para la ficha del cliente (sin importar sus módulos).
        TypeOrmModule.forFeature([Contact, ContactImport, Place, Order, Conversation, LoyaltyCard, Appointment]),
        AuditLogModule,
    ],
    controllers: [ContactsController],
    providers: [ContactsService],
    exports: [ContactsService, TypeOrmModule],
})
export class ContactsModule {}
