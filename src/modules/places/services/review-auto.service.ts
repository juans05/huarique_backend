import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../entities/place.entity';
import { GoogleBusinessService } from './google-business.service';
import { ReputationService } from './reputation.service';
import { MailService } from '../../../common/services/mail.service';
import { GbpReview, ReviewAutoSettings, starsOf } from '../review-reply.util';
import { shouldAlert } from '../reputation.util';

const RECENT_WINDOW_MS = 7 * 86_400_000;
// Fusiona solo alertsSince dentro de metadata.reviewAuto: no pisa lo que el dueño guarde mientras corre el cron.
const SET_ALERTS_SINCE_SQL = `UPDATE wuarike_db.places
   SET metadata = COALESCE(metadata, '{}'::jsonb)
     || jsonb_build_object('reviewAuto', COALESCE(metadata->'reviewAuto', '{}'::jsonb) || jsonb_build_object('alertsSince', $2::text))
 WHERE id = $1`;

/**
 * Cada 5 minutos, por local conectado a Google Business: avisa por correo de reseñas bajas o con
 * palabras clave, programa auto-respuestas (si el dueño las activó) y publica las que vencieron.
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
        private readonly reputation: ReputationService,
    ) {}

    // ponytail: polling cada 5 min; con cientos de locales conectados, pasar a notificaciones Pub/Sub (Fase 3).
    @Cron('0 */5 * * * *')
    async run() {
        if (this.running) return;
        this.running = true;
        try {
            const places = await this.placesRepo
                .createQueryBuilder('p')
                .leftJoinAndSelect('p.claimedBy', 'owner')
                .where('p.google_location_name IS NOT NULL')
                .andWhere('p.google_access_token IS NOT NULL')
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

    async processPlace(place: Place, now = Date.now()) {
        const settings: ReviewAutoSettings = place.metadata?.reviewAuto ?? {};
        const alertsOn = settings.alerts !== false && !!place.claimedBy?.email;
        const auto = settings.autoReply?.enabled ? settings.autoReply : null;
        const due = await this.reputation.dueJobs(place.id, new Date(now));
        if (!alertsOn && !auto && due.length === 0) return;

        // Las respuestas en lote son de reseñas antiguas: para confirmarlas hace falta la lista completa.
        const reviews: GbpReview[] = due.some((j) => j.origin === 'lote')
            ? (await this.google.getAllReviews(place.id)).reviews
            : await this.google.getRecentReviews(place.id, new Date(now - RECENT_WINDOW_MS));

        if (alertsOn) {
            const since = settings.alertsSince ? Date.parse(settings.alertsSince) : now;
            for (const r of reviews) {
                if (Date.parse(r.createTime) <= since) continue;
                const stars = starsOf(r);
                const { alert, matched } = shouldAlert(stars, r.comment, settings);
                if (!alert) continue;
                await this.mail.sendLowRatingAlert(place.claimedBy.email, place.name, {
                    source: 'google', stars, author: r.reviewer?.displayName, comment: r.comment, keywords: matched, cc: settings.alertEmail,
                });
            }
        }

        if (auto) {
            const from = Math.max(Date.parse(auto.since ?? '') || now, now - RECENT_WINDOW_MS);
            const candidates = reviews.filter((r) => !r.reviewReply && Date.parse(r.createTime) > from && auto.stars.includes(starsOf(r)));
            await this.reputation.scheduleAuto(place.id, candidates, auto, now);
        }

        const byName = new Map(reviews.map((r) => [r.name, r]));
        for (const job of due) {
            await this.reputation.publishJob(place, job, byName.get(job.reviewName ?? ''));
        }

        await this.placesRepo.query(SET_ALERTS_SINCE_SQL, [place.id, new Date(now).toISOString()]);
    }
}
