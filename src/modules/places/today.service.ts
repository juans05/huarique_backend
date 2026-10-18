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
const INACTIVITY_DAYS = 30; // mismo umbral que LoyaltyService.sendInactivityWinbacks
const DAY_MS = 86400_000;

// Último mensaje de cada chat humano abierto: solo cuenta pendiente el que cerró el cliente (INCOMING).
const LAST_MESSAGE_OF_OPEN_HUMAN_CHATS = `
    SELECT DISTINCT ON (m.conversation_id) m.message_type AS "messageType"
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
            (url) => new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false }) as unknown as TodayCache,
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

        const [lastTypes, [counts], inactive, winbacks, returning, program, newOrders, place] = await Promise.all([
            this.messageRepo.query(LAST_MESSAGE_OF_OPEN_HUMAN_CHATS, [placeId]) as Promise<{ messageType: string }[]>,
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
            pendingHumanChats: lastTypes.filter((r) => r.messageType === 'INCOMING').length,
            inactiveLoyalCustomers: inactive,
            winbackEnabled: program?.winbackEnabled ?? false,
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

        let unanswered: number;
        try {
            const { reviews } = await this.googleBusiness.getAllReviews(placeId);
            unanswered = reviews.filter((r) => !r.reviewReply).length;
        } catch (err: any) {
            this.logger.error(`No se pudieron leer las reseñas de Google (place ${placeId}): ${err?.message}`);
            return { connected: true, unanswered: 0 };
        }

        try {
            await this.cache.set(key, String(unanswered), 'EX', REVIEWS_TTL_SECONDS);
        } catch (err: any) {
            this.logger.warn(`Caché de reseñas no disponible (escritura): ${err?.message}`);
        }
        return { connected: true, unanswered };
    }
}
