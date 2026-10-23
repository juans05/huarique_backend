import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { TeamModule } from '../team/team.module';
import { Dish } from '../places/entities/dish.entity';
import { Place } from '../places/entities/place.entity';
import { Professional } from './entities/professional.entity';
import { Appointment, AppointmentDraft } from './entities/appointment.entity';
import { AppointmentsService } from './appointments.service';
import { BookingAgentService } from './booking-agent.service';
import { PublicAgendaController, StaffAgendaController } from './appointments.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Professional, Appointment, AppointmentDraft, Dish, Place]), TeamModule, AuthModule, AiModule],
    controllers: [StaffAgendaController, PublicAgendaController],
    providers: [AppointmentsService, BookingAgentService],
    exports: [AppointmentsService, BookingAgentService],
})
export class AppointmentsModule { }
