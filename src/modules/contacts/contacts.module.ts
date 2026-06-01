import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { Contact } from './entities/contact.entity';
import { ContactImport } from './entities/contact-import.entity';
import { Place } from '../places/entities/place.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Contact, ContactImport, Place]),
        AuditLogModule,
    ],
    controllers: [ContactsController],
    providers: [ContactsService],
    exports: [ContactsService, TypeOrmModule],
})
export class ContactsModule {}
