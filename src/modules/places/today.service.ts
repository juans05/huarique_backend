import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { Message } from '../whatsapp/entities/message.entity';
import { LoyaltyCard } from '../loyalty/entities/loyalty-card.entity';
import { LoyaltyProgram } from '../loyalty/entities/loyalty-program.entity';
import { Order } from '../orders/entities/order.entity';
import { Place } from './entities/place.entity';
import { GoogleBusinessService } from './services/google-business.service';

/** Lo mínimo de Redis que usa la caché de reseñas (inyectable para tests). */
export interface TodayCache {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
    disconnect(): void;
}

export const TODAY_CACHE_FACTORY = 'TODAY_CACHE_FACTORY';
const REVIEWS_TTL_SECONDS = 600;
const REVIEWS_FAILURE_TTL_SECONDS = 60; // si Google falla, no se le vuelve a preguntar en cada carga de Inicio
const INACTIVITY_DAYS = 30; // mismo umbral que LoyaltyService.sendInactivityWinbacks
const DAY_MS = 86400_000;

// Último mensaje de cada chat humano abierto. Pendiente = lo cerró el cliente (INCOMING) o un texto automático del
// bot (is_from_ai), p. ej. la derivación del menú: nadie del equipo ha respondido todavía.
const LAST_MESSAGE_OF_OPEN_HUMAN_CHATS = `
    SELECT DISTINCT ON (m.conversation_id) m.message_type AS "messageType", m.is_from_ai AS "isFromAi"
    FROM wuarike_db.messages m
    JOIN wuarike_db.conversations c ON c.id = m.conversation_id
    WHERE c.place_id = $1 AND c.mode = 'human' AND c.status <> 'cerrado'
    ORDER BY m.conversation_id, m.created_at DESC`;

// Chats con algún mensaje del bot en 24 h y chats con cualquier actividad en 7 días (una sola pasada).
const CHAT_COUNTS = `
    SELECT COUNT(DISTINCT m.conversation_id) FILTER (WHERE m.is_from_ai AND m.created_at >= $2) AS "botChats",
           COUNT(DISTINCT m.conversation_id) AS "weekChats"
    FROM wuarike_db.messages m
    JOIN wuarike_db.conversations c ON c.id = m.conversation_id
    WHERE c.place_id = $1 AND m.created_at >= $3`;

/** Datos de "Tu día" (inicio del panel). `getToday` solo toca la base; Google va aparte en `getReviewsToday`. */
@Injectable()
export class TodayService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TodayService.name);
    private cache: TodayCache;

    constructor(
        private readonly config: ConfigService,
        @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
        @InjectRepository(LoyaltyCard) private readonly cardRepo: Repository<LoyaltyCard>,
        @InjectRepository(LoyaltyProgram) private readonly programRepo: Repository<LoyaltyProgram>,
        @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
        @InjectRepository(Place) private readonly placeRepo: Repository<Place>,
        private readonly googleBusiness: GoogleBusinessService,
        @Optional() @Inject(TODAY_CACHE_FACTORY) private readonly createCache: (url: string) => TodayCache =
            // family: 0 = lookup dual-stack; *.railway.internal es IPv6-only en varios entornos (ver app.module.ts).
            (url) => new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, family: 0 }) as unknown as TodayCache,
    ) { }

    onModuleInit() {
        this.cache = this.createCache(this.config.get<string>('REDIS_URL') || 'redis://localhost:6379');
    }

    onModuleDestroy() {
        this.cache?.disconnect();
    }

    async getToday(placeId: string) {
        const now = Date.now();
        const since24h = new Date(now - DAY_MS);
        const since7d = new Date(now - 7 * DAY_MS);
        const inactiveBefore = new Date(now - INACTIVITY_DAYS * DAY_MS);

        const [lastMessages, [counts], inactive, winbacks, returning, program, newOrders, place] = await Promise.all([
            this.messageRepo.query(LAST_MESSAGE_OF_OPEN_HUMAN_CHATS, [placeId]) as Promise<{ messageType: string; isFromAi: boolean }[]>,
            this.messageRepo.query(CHAT_COUNTS, [placeId, since24h, since7d]) as Promise<{ botChats: string; weekChats: string }[]>,
            this.cardRepo.count({ where: { placeId, marketingConsent: true, lastVisitAt: LessThan(inactiveBefore) } }),
            this.cardRepo.count({ where: { placeId, lastWinbackSentAt: MoreThanOrEqual(since7d) } }),
            this.cardRepo.count({ where: { placeId, totalVisits: MoreThanOrEqual(2), lastVisitAt: MoreThanOrEqual(since7d) } }),
            this.programRepo.findOne({ where: { placeId } }),
            this.orderRepo.count({ where: { placeId, status: 'NUEVO' } }),
            this.placeRepo.findOne({ where: { id: placeId }, select: ['id', 'googleRating'] }),
        ]);

        return {
            botChatsSince24h: Number(counts?.botChats ?? 0),
            pendingHumanChats: lastMessages.filter((r) => r.messageType === 'INCOMING' || r.isFromAi).length,
            inactiveLoyalCustomers: inactive,
            winbackEnabled: !!(program?.winbackEnabled && program.isActive), // el envío diario exige ambos (sendInactivityWinbacks)
            winbacksSentThisWeek: winbacks,
            newOrders,
            weekStats: {
                chats: Number(counts?.weekChats ?? 0),
                returningCustomers: returning,
                googleRating: place?.googleRating != null ? Number(place.googleRating) : null, // decimal llega como string
            },
        };
    }

    /** Reseñas de Google sin responder. Nunca lanza: si Google (o Redis) falla, Inicio sigue cargando. */
    async getReviewsToday(placeId: string): Promise<{ connected: boolean; unanswered: number }> {
        const place = await this.placeRepo.findOne({ where: { id: placeId }, select: ['id', 'googleLocationName'] });
        if (!place?.googleLocationName) return { connected: false, unanswered: 0 };

        const key = `today:reviews:${placeId}`;
        try {
            const cached = await this.cache.get(key);
            if (cached !== null) return { connected: true, unanswered: Number(cached) };
        } catch (err: any) {
            this.logger.warn(`Caché de reseñas no disponible (lectura): ${err?.message}`);
        }

        // Si Google falla se cachea el 0 solo 60 s (misma clave): Inicio no insiste en cada carga mientras Google falla
        // (p. ej. aprobación de Business Profile pendiente) y se reintenta pronto.
        let unanswered = 0;
        let ttl = REVIEWS_TTL_SECONDS;
        try {
            const { reviews } = await this.googleBusiness.getAllReviews(placeId);
            unanswered = reviews.filter((r) => !r.reviewReply).length;
        } catch (err: any) {
            this.logger.warn(`No se pudieron leer las reseñas de Google (place ${placeId}): ${err?.message}`);
            ttl = REVIEWS_FAILURE_TTL_SECONDS;
        }

        try {
            await this.cache.set(key, String(unanswered), 'EX', ttl);
        } catch (err: any) {
            this.logger.warn(`Caché de reseñas no disponible (escritura): ${err?.message}`);
        }
        return { connected: true, unanswered };
    }
}
