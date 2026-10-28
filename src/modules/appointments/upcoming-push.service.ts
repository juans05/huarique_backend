import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { PushService } from '../push/push.service';
import { limaTime, timeLabel } from './appointments.rules';

/** "Ya te toca": push al barbero ~10 minutos antes de cada cita suya (solo barberías y barberos con cuenta). */
@Injectable()
export class UpcomingPushService {
    private readonly logger = new Logger(UpcomingPushService.name);
    private running = false;

    constructor(private dataSource: DataSource, private push: PushService) { }

    @Cron('* * * * *')
    async run() {
        if (this.running) return;
        this.running = true;
        try {
            // Marca y selecciona en una sola sentencia: aunque corran dos instancias, cada cita se avisa una vez.
            // En Postgres, un UPDATE ... RETURNING llega como [filas, cantidad].
            const [rows]: [any[], number] = await this.dataSource.query(`
                UPDATE wuarike_db.appointments a SET upcoming_pushed_at = now()
                FROM wuarike_db.place_professionals p, wuarike_db.places pl
                WHERE p.id = a.professional_id AND pl.id = a.place_id AND pl.business_type = 'barberia'
                  AND a.status = 'RESERVADA' AND a.upcoming_pushed_at IS NULL AND p.team_user_id IS NOT NULL
                  AND a.starts_at > now() AND a.starts_at <= now() + interval '10 minutes'
                RETURNING a.id, a.place_id, a.customer_name, a.service_name, a.starts_at, p.team_user_id`);
            for (const r of rows) {
                await this.push.sendToUsers([r.team_user_id], {
                    title: 'Ya te toca',
                    body: `${r.customer_name} · ${r.service_name} a las ${timeLabel(limaTime(new Date(r.starts_at)))}`,
                    data: { appointmentId: r.id, placeId: r.place_id, kind: 'te_toca' },
                });
            }
        } catch (err) {
            this.logger.error(`Aviso "ya te toca": ${(err as Error).message}`);
        } finally {
            this.running = false;
        }
    }
}
