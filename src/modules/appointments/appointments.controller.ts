import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { canUseApp } from './agenda-scope';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaceRoleGuard } from '../../common/guards/place-role.guard';
import { RequiresPlaceRole } from '../../common/decorators/requires-place-role.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppointmentsService } from './appointments.service';
import { RemindersService } from './reminders.service';
import { RecallService } from './recall.service';
import { AssetDto, AvailabilityQueryDto, BookDto, DayQueryDto, ProfessionalDto, PublicBookDto, RangeQueryDto, RecallSettingsDto, RemindersSettingsDto, UpdateAppointmentDto } from './dto/appointments.dto';

/** Agenda vista por el personal del local (recepción, dueño). La Agenda es del plan base. */
@UseGuards(JwtAuthGuard, PlaceRoleGuard)
@Controller('business/places/:placeId/agenda')
export class StaffAgendaController {
    constructor(private agenda: AppointmentsService, private reminders: RemindersService, private recall: RecallService) { }

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
        return this.reminders.ensureTemplates(placeId, await this.agenda.assetKind(placeId));
    }

    @Patch('reminders')
    @RequiresPlaceRole('supervisor')
    async setReminders(@Param('placeId') placeId: string, @Body() dto: RemindersSettingsDto) {
        await this.agenda.assertEnabled(placeId);
        return this.reminders.setSettings(placeId, dto);
    }

    // ── Aviso de rutina ("ya se acerca tu próximo corte") ──
    @Get('recall')
    @RequiresPlaceRole('agente')
    async recallSettings(@Param('placeId') placeId: string) {
        await this.agenda.assertEnabled(placeId);
        return this.recall.settings(placeId);
    }

    @Patch('recall')
    @RequiresPlaceRole('supervisor')
    async setRecall(@Param('placeId') placeId: string, @Body() dto: RecallSettingsDto) {
        await this.agenda.assertEnabled(placeId);
        return this.recall.setEnabled(placeId, dto.enabled);
    }

    @Post('recall/template')
    @RequiresPlaceRole('supervisor')
    async createRecallTemplate(@Param('placeId') placeId: string) {
        await this.agenda.assertEnabled(placeId);
        return this.recall.ensureTemplate(placeId);
    }

    @Get('recall/upcoming')
    @RequiresPlaceRole('agente')
    async recallUpcoming(@Param('placeId') placeId: string) {
        await this.agenda.assertEnabled(placeId);
        return this.recall.upcoming(placeId);
    }

    @Post('recall/:appointmentId/notify')
    @RequiresPlaceRole('agente')
    @Throttle({ default: { ttl: 60000, limit: 30 } })
    async recallNotify(@Param('placeId') placeId: string, @Param('appointmentId', ParseUUIDPipe) appointmentId: string) {
        await this.agenda.assertEnabled(placeId);
        return this.recall.notifyNow(placeId, appointmentId);
    }

    /** Qué ve este usuario en la agenda (la app del barbero arma sus pestañas con esto). */
    @Get('me')
    @RequiresPlaceRole('agente')
    async me(@Req() req: any) {
        const member = req.placeTeamMember;
        const s = await this.agenda.agendaScope(member);
        return { ...s, role: member.role, canUseApp: canUseApp(member.role, s) };
    }

    @Get('day')
    @RequiresPlaceRole('agente')
    async day(@Param('placeId') placeId: string, @Query() q: DayQueryDto, @Req() req: any) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.day(placeId, q.date, (await this.agenda.agendaScope(req.placeTeamMember)).professionalId);
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
    async book(@Param('placeId') placeId: string, @Body() dto: BookDto, @CurrentUser() user: any, @Req() req: any) {
        await this.agenda.assertEnabled(placeId);
        if ((await this.agenda.agendaScope(req.placeTeamMember)).scope === 'own') throw new ForbiddenException('Solo el local puede crear citas');
        return this.agenda.book(placeId, dto, 'PANEL', user.id);
    }

    @Get('range')
    @RequiresPlaceRole('agente')
    async range(@Param('placeId') placeId: string, @Query() q: RangeQueryDto, @Req() req: any) {
        await this.agenda.assertEnabled(placeId);
        const { professionalId } = await this.agenda.agendaScope(req.placeTeamMember);
        const [range, recallDue] = await Promise.all([this.agenda.range(placeId, q.from, q.to, professionalId), this.recall.dueByDay(placeId, q.from, q.to)]);
        return { ...range, recallDue };
    }

    @Get('appointments/:id')
    @RequiresPlaceRole('agente')
    async one(@Param('placeId') placeId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.one(placeId, id, (await this.agenda.agendaScope(req.placeTeamMember)).professionalId);
    }

    @Patch('appointments/:id')
    @RequiresPlaceRole('agente')
    async update(@Param('placeId') placeId: string, @Param('id') id: string, @Body() dto: UpdateAppointmentDto, @Req() req: any) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.update(placeId, id, dto, (await this.agenda.agendaScope(req.placeTeamMember)).professionalId);
    }

    @Get('assets')
    @RequiresPlaceRole('agente')
    async assets(@Param('placeId') placeId: string, @Query('phone') phone?: string) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.assets(placeId, phone);
    }

    @Post('assets')
    @RequiresPlaceRole('agente')
    async createAsset(@Param('placeId') placeId: string, @Body() dto: AssetDto) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.saveAsset(placeId, null, dto);
    }

    @Patch('assets/:id')
    @RequiresPlaceRole('agente')
    async updateAsset(@Param('placeId') placeId: string, @Param('id') id: string, @Body() dto: AssetDto) {
        await this.agenda.assertEnabled(placeId);
        return this.agenda.saveAsset(placeId, id, dto);
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
