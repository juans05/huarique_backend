import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaceRoleGuard } from '../../common/guards/place-role.guard';
import { RequiresPlaceRole } from '../../common/decorators/requires-place-role.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppointmentsService } from './appointments.service';
import { RemindersService } from './reminders.service';
import { AvailabilityQueryDto, BookDto, DayQueryDto, ProfessionalDto, PublicBookDto, UpdateAppointmentDto } from './dto/appointments.dto';

/** Agenda vista por el personal del local (recepción, dueño). La Agenda es del plan base. */
@UseGuards(JwtAuthGuard, PlaceRoleGuard)
@Controller('business/places/:placeId/agenda')
export class StaffAgendaController {
    constructor(private agenda: AppointmentsService, private reminders: RemindersService) { }

    // ── Recordatorios por WhatsApp ──
    @Get('reminders')
    @RequiresPlaceRole('agente')
    async remindersStatus(@Param('placeId') placeId: string) {
        await this.agenda.assertEnabled(placeId);
        return this.reminders.status(placeId);
    }

    @Post('reminders/template')
    @RequiresPlaceRole('supervisor')
    async createReminderTemplate(@Param('placeId') placeId: string) {
        await this.agenda.assertEnabled(placeId);
        return this.reminders.ensureTemplate(placeId);
    }

    @Patch('reminders')
    @RequiresPlaceRole('supervisor')
    async setReminders(@Param('placeId') placeId: string, @Body('enabled') enabled: boolean) {
        await this.agenda.assertEnabled(placeId);
        return this.reminders.setEnabled(placeId, enabled !== false);
    }

    @Get('day')
    @RequiresPlaceRole('agente')
    async day(@Param('placeId') placeId: string, @Query() q: DayQueryDto) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.day(placeId, q.date);
    }

    @Get('services')
    @RequiresPlaceRole('agente')
    async services(@Param('placeId') placeId: string) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.services(placeId);
    }

    @Get('availability')
    @RequiresPlaceRole('agente')
    async availability(@Param('placeId') placeId: string, @Query() q: AvailabilityQueryDto) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.availability(placeId, q.serviceId, q.date, q.professionalId);
    }

    @Post('appointments')
    @RequiresPlaceRole('agente')
    async book(@Param('placeId') placeId: string, @Body() dto: BookDto, @CurrentUser() user: any) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.book(placeId, dto, 'PANEL', user.id);
    }

    @Patch('appointments/:id')
    @RequiresPlaceRole('agente')
    async update(@Param('placeId') placeId: string, @Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.update(placeId, id, dto);
    }

    @Get('professionals')
    @RequiresPlaceRole('agente')
    async professionals(@Param('placeId') placeId: string) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.professionals(placeId);
    }

    @Post('professionals')
    @RequiresPlaceRole('supervisor')
    async createProfessional(@Param('placeId') placeId: string, @Body() dto: ProfessionalDto) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.saveProfessional(placeId, null, dto);
    }

    @Patch('professionals/:id')
    @RequiresPlaceRole('supervisor')
    async updateProfessional(@Param('placeId') placeId: string, @Param('id') id: string, @Body() dto: ProfessionalDto) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.saveProfessional(placeId, id, dto);
    }
}

/** Link público de reservas: el cliente elige servicio, profesional, día y hora sin iniciar sesión. */
@Controller('public/agenda')
export class PublicAgendaController {
    constructor(private agenda: AppointmentsService) { }

    @Get('cita/:token')
    byToken(@Param('token') token: string) {
        return this.agenda.byToken(token);
    }

    @Post('cita/:token/cancel')
    @Throttle({ default: { ttl: 60000, limit: 10 } })
    cancel(@Param('token') token: string) {
        return this.agenda.cancelByToken(token);
    }

    @Get(':placeId')
    async info(@Param('placeId') placeId: string) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.publicInfo(placeId);
    }

    @Get(':placeId/availability')
    async availability(@Param('placeId') placeId: string, @Query() q: AvailabilityQueryDto) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.availability(placeId, q.serviceId, q.date, q.professionalId);
    }

    @Post(':placeId/book')
    @Throttle({ default: { ttl: 60000, limit: 5 } })
    async book(@Param('placeId') placeId: string, @Body() dto: PublicBookDto) {
        await this.agenda.assertEnabled(placeId);
        const appt = await this.agenda.book(placeId, dto, 'WEB', null);
        return { publicToken: appt.publicToken, date: appt.date, time: appt.time, serviceName: appt.serviceName, professional: appt.professional };
    }
}
