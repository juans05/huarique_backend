import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PushService } from '../push/push.service';
import { addDays, dayLabel, limaDate, limaTime, timeLabel } from './appointments.rules';

type ApptInfo = { id: string; placeId: string; customerName: string; serviceName: string; startsAt: Date };

/** "hoy a las 4:30 pm", "mañana a las 11:00 am" o "sábado 31 a las 10:00 am" (hora de Lima). */
export function whenLabel(startsAt: Date, now = new Date()) {
    const date = limaDate(startsAt);
    const today = limaDate(now);
    const day = date === today ? 'hoy' : date === addDays(today, 1) ? 'mañana' : dayLabel(date);
    return `${day} a las ${timeLabel(limaTime(startsAt))}`;
}

/** Push de la app del barbero al reservar o traspasar una cita. Solo barberías; nunca lanza. */
@Injectable()
export class AppointmentPush {
    private readonly logger = new Logger(AppointmentPush.name);

    constructor(private dataSource: DataSource, private push: PushService) { }

    async onBooked(appt: ApptInfo, barberUserId: string | null, now = new Date()) {
        try {
            const [place] = await this.dataSource.query(
                `SELECT pl.business_type, pl.claimed_by_user_id AS owner,
                        COALESCE((SELECT array_agg(m.user_id) FROM wuarike_db.place_team_members m
                                  WHERE m.place_id = pl.id AND m.role IN ('admin', 'supervisor')), '{}') AS managers
                 FROM wuarike_db.places pl WHERE pl.id = $1`,
                [appt.placeId],
            );
            if (place?.business_type !== 'barberia') return;
            const to = [...new Set([place.owner, ...place.managers, barberUserId].filter(Boolean))] as string[];
            await this.push.sendToUsers(to, {
                title: 'Nueva reserva',
                body: `${appt.customerName} reservó ${appt.serviceName} para ${whenLabel(appt.startsAt, now)}`,
                data: { appointmentId: appt.id, placeId: appt.placeId, kind: 'nueva' },
            });
        } catch (err) {
            this.logger.warn(`Push de reserva no enviada: ${(err as Error).message}`);
        }
    }

    async onTransferred(appt: ApptInfo, newBarberUserId: string | null, now = new Date()) {
        if (!newBarberUserId) return;
        await this.push.sendToUsers([newBarberUserId], {
            title: 'Te pasaron una cita',
            body: `${appt.customerName} · ${appt.serviceName} · ${whenLabel(appt.startsAt, now)}`,
            data: { appointmentId: appt.id, placeId: appt.placeId, kind: 'traspaso' },
        });
    }
}
