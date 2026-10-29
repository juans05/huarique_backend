import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { ReviewReply } from '../entities/review-reply.entity';
import { Place } from '../entities/place.entity';
import { GoogleBusinessService } from './google-business.service';
import { AiService } from '../../ai/ai.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { AutoReplySettings, GbpReview, buildReplyMessages, replyOptions, starsOf } from '../review-reply.util';
import { PUBLISH_PER_RUN, aiReplyLimit, limaMonthStart, randomDelayMs, templateReply } from '../reputation.util';

const AUTO_ORIGINS = ['auto', 'lote'] as const;

/** Cupo mensual de IA y cola de respuestas automáticas a reseñas de Google. */
@Injectable()
export class ReputationService {
    private readonly logger = new Logger(ReputationService.name);

    constructor(
        @InjectRepository(ReviewReply) private readonly replies: Repository<ReviewReply>,
        private readonly google: GoogleBusinessService,
        private readonly ai: AiService,
        private readonly subscriptions: SubscriptionsService,
    ) {}

    async aiQuota(placeId: string, now = new Date()) {
        const sub = await this.subscriptions.getSubscriptionForPlace(placeId);
        const limit = aiReplyLimit(sub?.status === 'active' ? sub.tier : null);
        const used = await this.replies.count({ where: { placeId, aiGenerated: true, createdAt: MoreThanOrEqual(limaMonthStart(now)) } });
        return { limit, used, remaining: Math.max(0, limit - used) };
    }

    // ponytail: dos sugerencias simultáneas pueden pasarse del cupo por 1; bloquear fila si alguna vez importa.
    async logSuggestion(placeId: string, reviewName: string | null, stars: number) {
        await this.replies.insert({ placeId, reviewName, stars, origin: 'sugerencia', status: 'sugerida', aiGenerated: true });
    }

    /** IA si hay cupo; si no (o si la IA falla), plantilla para 4–5 ★; null para 1–3 ★ sin IA. */
    async replyTextFor(place: Place, review: GbpReview): Promise<{ text: string; ai: boolean } | null> {
        const stars = starsOf(review);
        if ((await this.aiQuota(place.id)).remaining > 0) {
            try {
                const settings = place.metadata?.reviewAuto ?? {};
                const text = (await this.ai.chat(buildReplyMessages(place.name, stars, review.reviewer?.displayName, review.comment, replyOptions(settings)))).trim();
                if (text) return { text, ai: true };
            } catch (err) {
                this.logger.warn(`[reputacion] IA falló para ${place.id}: ${err?.message}`);
            }
        }
        const text = templateReply(stars, review.reviewer?.displayName, review.name.length);
        return text ? { text, ai: false } : null;
    }

    async scheduleAuto(placeId: string, reviews: GbpReview[], auto: AutoReplySettings, now: number): Promise<number> {
        if (!reviews.length) return 0;
        // Cualquier fila previa (incluida una cancelada por el dueño) bloquea volver a programar.
        const existing = await this.replies.find({ where: { placeId, reviewName: In(reviews.map((r) => r.name)), origin: In([...AUTO_ORIGINS]) } });
        const taken = new Set(existing.map((e) => e.reviewName));
        const rows = reviews.filter((r) => !taken.has(r.name)).map((r) => ({
            placeId,
            reviewName: r.name,
            stars: starsOf(r),
            origin: 'auto' as const,
            status: 'programada' as const,
            scheduledAt: new Date(now + randomDelayMs(auto.delayMin, auto.delayMax)),
        }));
        if (rows.length) await this.replies.insert(rows);
        return rows.length;
    }

    dueJobs(placeId: string, now: Date) {
        return this.replies.find({
            where: { placeId, status: 'programada', scheduledAt: LessThanOrEqual(now) },
            order: { scheduledAt: 'ASC' },
            take: PUBLISH_PER_RUN,
        });
    }

    async publishJob(place: Place, job: ReviewReply, review: GbpReview | undefined) {
        if (!review || review.reviewReply) {
            await this.replies.update(job.id, { status: 'cancelada' });
            return;
        }
        // Reintento: reusar el texto ya generado para no gastar IA dos veces.
        const generated = job.replyText ? null : await this.replyTextFor(place, review);
        const text = job.replyText ?? generated?.text;
        if (!text) {
            await this.replies.update(job.id, { status: 'sin_cupo' });
            return;
        }
        const textFields = generated ? { replyText: generated.text, aiGenerated: generated.ai } : {};
        try {
            await this.google.replyToReview(place.id, review.name, text);
            await this.replies.update(job.id, { ...textFields, status: 'publicada', publishedAt: new Date(), error: null });
        } catch (err) {
            const attempts = job.attempts + 1;
            await this.replies.update(job.id, {
                ...textFields,
                attempts,
                status: attempts >= 2 ? 'error' : 'programada',
                error: String(err?.message ?? err).slice(0, 500),
            });
        }
    }

    async enqueueBulk(placeId: string, body: { stars?: number[]; max?: number }) {
        const stars = (body.stars ?? []).map(Number).filter((s) => Number.isInteger(s) && s >= 1 && s <= 5);
        const max = Math.min(Math.max(Math.round(Number(body.max) || 50), 1), 200);
        const { reviews } = await this.google.getAllReviews(placeId);
        const pending = reviews.filter((r) => !r.reviewReply && stars.includes(starsOf(r)));
        const live = pending.length
            ? await this.replies.find({ where: { placeId, reviewName: In(pending.map((r) => r.name)), origin: In([...AUTO_ORIGINS]), status: In(['programada', 'publicada']) } })
            : [];
        const taken = new Set(live.map((l) => l.reviewName));
        const now = new Date();
        const rows = pending.filter((r) => !taken.has(r.name)).slice(0, max).map((r) => ({
            placeId, reviewName: r.name, stars: starsOf(r), origin: 'lote' as const, status: 'programada' as const, scheduledAt: now,
        }));
        if (rows.length) await this.replies.insert(rows);
        return { encoladas: rows.length, cupoIaRestante: (await this.aiQuota(placeId)).remaining };
    }

    listReplies(placeId: string) {
        return this.replies.find({
            select: ['id', 'reviewName', 'origin', 'status', 'scheduledAt', 'publishedAt', 'aiGenerated', 'error'],
            where: { placeId, origin: In([...AUTO_ORIGINS]), createdAt: MoreThanOrEqual(new Date(Date.now() - 90 * 86_400_000)) },
            order: { createdAt: 'DESC' },
            take: 500,
        });
    }

    async cancel(placeId: string, replyId: string) {
        await this.replies.update({ id: replyId, placeId, status: 'programada' }, { status: 'cancelada' });
    }
}
