import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { PlaceTeamService } from '../team/place-team.service';
import { AppointmentDraft } from './entities/appointment.entity';
import { AppointmentsService } from './appointments.service';
import { addDays, dayLabel, limaDate, looksLikeBookingIntent, parseAgentJson, timeLabel } from './appointments.rules';

const DRAFT_TTL_MS = 30 * 60_000;
const MAX_DAYS_AHEAD = 30;
const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2)}`;
type Action = { type: string; serviceId?: string; professionalId?: string; date?: string; time?: string };

/**
 * Reserva de citas por WhatsApp. La IA solo entiende lo que pide el cliente (servicio, profesional, día, hora);
 * los horarios libres, el resumen y la confirmación los arma el servidor, así nunca ofrece un horario ocupado.
 */
@Injectable()
export class BookingAgentService {
    private readonly logger = new Logger(BookingAgentService.name);

    constructor(
        @InjectRepository(AppointmentDraft) private draftsRepo: Repository<AppointmentDraft>,
        private appointments: AppointmentsService,
        private ai: AiService,
        private team: PlaceTeamService,
        private config: ConfigService,
    ) { }

    async handle(input: { placeId: string; customerName: string; customerPhone: string; message: string; history: { role: 'user' | 'assistant'; content: string }[] }): Promise<{ handled: false } | { handled: true; reply: string }> {
        let draft = await this.draftsRepo.findOne({ where: { placeId: input.placeId, customerPhone: input.customerPhone, status: 'ARMANDO' } });
        if (draft && Date.now() - new Date(draft.updatedAt).getTime() > DRAFT_TTL_MS) {
            await this.draftsRepo.update({ id: draft.id }, { status: 'EXPIRADO' });
            draft = null;
        }
        if (!draft && !looksLikeBookingIntent(input.message)) return { handled: false };
        if (!(await this.team.assertPlaceTier(input.placeId, 'ia_total').then(() => true, () => false))) return { handled: false };

        const [services, pros] = await Promise.all([this.appointments.services(input.placeId), this.appointments.professionals(input.placeId, true)]);
        if (!services.length || !pros.length) return { handled: false };
        draft ??= this.draftsRepo.create({ placeId: input.placeId, customerPhone: input.customerPhone, serviceId: null, professionalId: null, date: null, time: null, status: 'ARMANDO' });
        const today = limaDate(new Date());

        const raw = await this.ai.chat([
            { role: 'system', content: this.prompt(services, pros, draft, today) },
            ...input.history.slice(-10),
            { role: 'user', content: input.message },
        ], undefined, 400);
        const parsed = parseAgentJson<Action>(raw);
        if (!parsed) {
            this.logger.warn(`Respuesta de IA no parseable: ${raw.slice(0, 200)}`);
            return { handled: true, reply: '¿Me repites qué servicio quieres y para qué día?' };
        }

        let confirm = false;
        for (const a of parsed.actions) {
            if (a.type === 'cancel') {
                if (draft.id) await this.draftsRepo.update({ id: draft.id }, { status: 'EXPIRADO' });
                return { handled: true, reply: 'Listo, no agendé nada. Escríbeme cuando quieras reservar.' };
            }
            if (a.type === 'set_service' && services.some((s) => s.id === a.serviceId)) { draft.serviceId = a.serviceId!; draft.time = null; }
            if (a.type === 'set_professional' && (a.professionalId === 'any' || pros.some((p) => p.id === a.professionalId))) { draft.professionalId = a.professionalId!; draft.time = null; }
            if (a.type === 'set_date' && /^\d{4}-\d{2}-\d{2}$/.test(a.date ?? '') && a.date! >= today && a.date! <= addDays(today, MAX_DAYS_AHEAD)) { draft.date = a.date!; draft.time = null; }
            if (a.type === 'set_time' && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.time ?? '')) draft.time = a.time!;
            if (a.type === 'confirm') confirm = true;
        }

        const reply = await this.nextStep(input, draft, services, pros, parsed.reply, confirm);
        if (draft.status === 'ARMANDO') await this.draftsRepo.save(draft);
        return { handled: true, reply };
    }

    /** Qué falta y qué responder: servicio → profesional → día → hora libre → confirmar → cita creada. */
    private async nextStep(input: { placeId: string; customerName: string; customerPhone: string }, draft: AppointmentDraft, services: any[], pros: any[], aiReply: string, confirm: boolean): Promise<string> {
        const service = services.find((s) => s.id === draft.serviceId);
        if (!service) return `${aiReply ? aiReply + '\n\n' : ''}¿Qué servicio deseas?\n${services.map((s) => `• ${s.name} (${soles(s.price)}, ${s.durationMin} min)`).join('\n')}`;

        const able = pros.filter((p) => this.appointments.doesService(p, service.id));
        if (able.length === 1 && !draft.professionalId) draft.professionalId = able[0].id;
        if (!draft.professionalId) return `¿Con quién te gustaría atenderte?\n${able.map((p) => `• ${p.name}${p.station ? ` (${p.station})` : ''}`).join('\n')}\n• Cualquiera disponible`;
        const pro = pros.find((p) => p.id === draft.professionalId);
        const proName = pro ? `${pro.name}${pro.station ? ` (${pro.station})` : ''}` : 'el primero disponible';

        if (!draft.date) return aiReply || `¿Para qué día quieres tu ${service.name.toLowerCase()} con ${proName}?`;

        const proId = draft.professionalId === 'any' ? null : draft.professionalId;
        const avail = await this.appointments.availability(input.placeId, service.id, draft.date, proId);
        const slots = proId ? avail.professionals[0]?.slots ?? [] : avail.any;
        if (!slots.length) {
            const next = await this.nextDayWithSlots(input.placeId, service.id, proId, draft.date);
            draft.time = null;
            return next
                ? `El ${dayLabel(draft.date)} no hay horarios libres con ${proName}. El ${dayLabel(next.date)} tengo: ${next.slots.slice(0, 6).map(timeLabel).join(', ')}. ¿Te sirve?`
                : `No encontré horarios libres con ${proName} en los próximos días. ¿Quieres probar con otra persona?`;
        }
        if (!draft.time || !slots.includes(draft.time)) {
            const wanted = draft.time;
            draft.time = null;
            // Si pidió una hora ocupada, ofrece las más cercanas a esa hora.
            const options = wanted ? [...slots].sort((a, b) => Math.abs(this.min(a) - this.min(wanted)) - Math.abs(this.min(b) - this.min(wanted))).slice(0, 6).sort() : this.spread(slots, 8);
            return `${wanted ? `A las ${timeLabel(wanted)} ya no hay cupo. ` : ''}Horarios libres el ${dayLabel(draft.date)} con ${proName}: ${options.map(timeLabel).join(', ')}. ¿Cuál prefieres?`;
        }

        const summary = `${service.name} con ${proName}, el ${dayLabel(draft.date)} a las ${timeLabel(draft.time)} (${soles(service.price)})`;
        if (!confirm) return `¿Confirmo tu cita? ${summary}.`;

        try {
            const appt = await this.appointments.book(input.placeId, {
                serviceId: service.id, professionalId: proId, date: draft.date, time: draft.time,
                customerName: input.customerName || 'Cliente', customerPhone: input.customerPhone,
            }, 'BOT', null);
            draft.status = 'CONFIRMADO';
            draft.appointmentId = appt.id;
            await this.draftsRepo.save(draft);
            const link = `${this.config.get<string>('DASHBOARD_URL') || 'https://admin.wuarikes.com'}/reservar/cita/${appt.publicToken}`;
            const who = appt.professional ? `${appt.professional.name}${appt.professional.station ? ` (${appt.professional.station})` : ''}` : proName;
            return `¡Listo! Tu cita quedó agendada: ${service.name} con ${who}, el ${dayLabel(draft.date)} a las ${timeLabel(draft.time)}. Si necesitas cancelar: ${link}`;
        } catch (err) {
            if (!(err instanceof BadRequestException)) throw err;
            draft.time = null;
            return `${err.message} ¿Te muestro otros horarios?`;
        }
    }

    private async nextDayWithSlots(placeId: string, serviceId: string, proId: string | null, from: string) {
        for (let i = 1; i <= 7; i++) {
            const date = addDays(from, i);
            const a = await this.appointments.availability(placeId, serviceId, date, proId);
            const slots = proId ? a.professionals[0]?.slots ?? [] : a.any;
            if (slots.length) return { date, slots };
        }
        return null;
    }

    private min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    /** Hasta n horarios repartidos en el día (mañana, mediodía y tarde), no solo los primeros. */
    private spread(slots: string[], n: number) {
        if (slots.length <= n) return slots;
        return Array.from({ length: n }, (_, i) => slots[Math.round((i * (slots.length - 1)) / (n - 1))]);
    }

    private prompt(services: any[], pros: any[], draft: AppointmentDraft, today: string) {
        return [
            'Eres la recepción de un negocio que atiende con cita, por WhatsApp. Respondes en español, breve y amable.',
            `Hoy es ${dayLabel(today)} (${today}). Calcula fechas relativas ("mañana", "el sábado") a partir de hoy, en formato AAAA-MM-DD.`,
            'Servicios (usa exactamente su id):',
            ...services.map((s) => `- id=${s.id} | ${s.name} | ${s.durationMin} min | ${soles(s.price)}`),
            'Profesionales (usa exactamente su id, o "any" si le da igual):',
            ...pros.map((p) => `- id=${p.id} | ${p.name}${p.station ? ` | ${p.station}` : ''}`),
            `Lo elegido hasta ahora: servicio=${draft.serviceId ?? 'ninguno'}, profesional=${draft.professionalId ?? 'ninguno'}, día=${draft.date ?? 'ninguno'}, hora=${draft.time ?? 'ninguna'}.`,
            'No inventes horarios ni confirmes tú: el sistema revisa los cupos. Solo traduce lo que el cliente pide en acciones.',
            'Si dice una hora ("a las 4 de la tarde"), conviértela a 24 h (16:00). Usa confirm solo cuando el cliente acepte el resumen ("sí", "ok", "confirma").',
            'Responde SOLO con JSON: {"reply": "<texto corto para el cliente>", "actions": [ ... ]}.',
            'Acciones: {"type":"set_service","serviceId":"..."} | {"type":"set_professional","professionalId":"..."|"any"} | {"type":"set_date","date":"AAAA-MM-DD"} | {"type":"set_time","time":"HH:MM"} | {"type":"confirm"} | {"type":"cancel"}.',
        ].join('\n');
    }
}
