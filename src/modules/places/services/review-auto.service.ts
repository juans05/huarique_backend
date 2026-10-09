import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../entities/place.entity';
import { GoogleBusinessService } from './google-business.service';
import { MailService } from '../../../common/services/mail.service';
import { ReviewAutoSettings, starsOf } from '../review-reply.util';

/**
 * Cada 10 minutos revisa las reseñas de Google de los locales conectados y avisa por correo
 * de las de 1 a 3 estrellas. Nada se publica solo: las respuestas las aprueba el dueño desde Reputación.
 * Solo avisa de reseñas nuevas desde que se activaron las alertas, nunca del historial.
 */
@Injectable()
export class ReviewAutoService {
    private readonly logger = new Logger(ReviewAutoService.name);
    private running = false;

    constructor(
        @InjectRepository(Place) private readonly placesRepo: Repository<Place>,
        private readonly google: GoogleBusinessService,
        private readonly mail: MailService,
    ) {}

    // ponytail: polling cada 10 min; si hace falta aviso instantáneo, usar notificaciones Pub/Sub de Google Business.
    @Cron('0 */10 * * * *')
    async run() {
        if (this.running) return;
        this.running = true;
        try {
            const places = await this.placesRepo
                .createQueryBuilder('p')
                .leftJoinAndSelect('p.claimedBy', 'owner')
                .where('p.google_location_name IS NOT NULL')
                .andWhere('p.google_access_token IS NOT NULL')
                .andWhere(`COALESCE(p.metadata->'reviewAuto'->>'alerts', 'true') <> 'false'`)
                .getMany();
            for (const place of places) {
                try {
                    await this.processPlace(place);
                } catch (err) {
                    this.logger.warn(`[review-auto] ${place.name}: ${err?.message}`);
                }
            }
        } finally {
            this.running = false;
        }
    }

    private async processPlace(place: Place) {
        if (!place.claimedBy?.email) return;
        const settings: ReviewAutoSettings = place.metadata?.reviewAuto ?? {};
        const { reviews } = await this.google.getAllReviews(place.id);
        const now = Date.now();
        // Sin fecha de activación (alertas por defecto) se empieza desde ahora: no se avisa del historial.
        const alertsSince = settings.alertsSince ? Date.parse(settings.alertsSince) : now;

        for (const r of reviews) {
            const stars = starsOf(r);
            if (stars >= 1 && stars <= 3 && Date.parse(r.createTime) > alertsSince) {
                await this.mail.sendLowRatingAlert(place.claimedBy.email, place.name, {
                    source: 'google',
                    stars,
                    author: r.reviewer?.displayName,
                    comment: r.comment,
                });
            }
        }

        // Marca hasta dónde se avisó para no repetir correos en la siguiente ejecución.
        place.metadata = { ...(place.metadata ?? {}), reviewAuto: { alerts: true, alertsSince: new Date(now).toISOString() } };
        await this.placesRepo.update(place.id, { metadata: place.metadata });
    }
}
