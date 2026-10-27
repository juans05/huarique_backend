import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { MessagingModule } from '../messaging/messaging.module';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { AuthModule } from '../auth/auth.module';
import { TeamModule } from '../team/team.module';
import { Dish } from '../places/entities/dish.entity';
import { Place } from '../places/entities/place.entity';
import { Professional } from './entities/professional.entity';
import { Appointment, AppointmentDraft } from './entities/appointment.entity';
import { CustomerAsset } from './entities/customer-asset.entity';
import { AppointmentsService } from './appointments.service';
import { BookingAgentService } from './booking-agent.service';
import { RemindersService } from './reminders.service';
import { RecallService } from './recall.service';
import { AppointmentPush } from './appointment-push';
import { UpcomingPushService } from './upcoming-push.service';
import { PushModule } from '../push/push.module';
import { PublicAgendaController, StaffAgendaController } from './appointments.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Professional, Appointment, AppointmentDraft, CustomerAsset, Dish, Place, WhatsAppNumber]), TeamModule, AuthModule, AiModule, MessagingModule, PushModule],
    controllers: [StaffAgendaController, PublicAgendaController],
    providers: [AppointmentsService, BookingAgentService, RemindersService, RecallService, AppointmentPush, UpcomingPushService],
    exports: [AppointmentsService, BookingAgentService, RemindersService],
})
export class AppointmentsModule { }
