import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';

export type OrderEventType = 'order.created' | 'order.status_changed' | 'tab.updated' | 'tab.bill_requested' | 'payment.confirmed' | 'tab.closed';

export interface OrderEvent {
    type: OrderEventType;
    placeId: string;
    orderId?: string;
    tabId?: string;
    tableId?: string;
    status?: string;
    publicTokens: string[];
}

export interface StreamMessage { data: OrderEvent | { type: 'ping' } }

interface RedisLike {
    publish(channel: string, message: string): Promise<number>;
    subscribe(channel: string): Promise<unknown>;
    on(event: 'message', listener: (channel: string, message: string) => void): unknown;
    duplicate(): RedisLike;
    disconnect(): void;
}

export const ORDERS_REDIS_FACTORY = 'ORDERS_REDIS_FACTORY';
const CHANNEL = 'orders:events';
const HEARTBEAT_MS = 25_000;
const PUBLISH_TIMEOUT_MS = 1000;

@Injectable()
export class OrderEventsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(OrderEventsService.name);
    private readonly bus = new Subject<OrderEvent>();
    private publisher: RedisLike;
    private subscriber: RedisLike;

    constructor(
        private readonly config: ConfigService,
        @Optional() @Inject(ORDERS_REDIS_FACTORY) private readonly createClient: (url: string) => RedisLike = (url) => new Redis(url, { maxRetriesPerRequest: null }) as unknown as RedisLike,
    ) { }

    onModuleInit() {
        const url = this.config.get<string>('REDIS_URL') || 'redis://localhost:6379';
        this.publisher = this.createClient(url);
        this.subscriber = this.publisher.duplicate();
        this.subscriber.subscribe(CHANNEL).catch((err) => this.logger.error(`No se pudo suscribir a ${CHANNEL}`, err));
        this.subscriber.on('message', (_channel, raw) => {
            try { this.bus.next(JSON.parse(raw) as OrderEvent); } catch { this.logger.warn(`Evento inválido: ${raw}`); }
        });
    }

    onModuleDestroy() {
        this.publisher?.disconnect();
        this.subscriber?.disconnect();
    }

    /** Nunca bloquea ni rompe el flujo que avisa (pago, cambio de estado): si Redis falla, solo se pierde el aviso en vivo. */
    async publish(event: OrderEvent): Promise<void> {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`sin respuesta en ${PUBLISH_TIMEOUT_MS} ms`)), PUBLISH_TIMEOUT_MS); });
        try {
            await Promise.race([this.publisher.publish(CHANNEL, JSON.stringify(event)), timeout]);
        } catch (err: any) {
            this.logger.error(`No se pudo publicar ${event.type} (${event.placeId}): ${err?.message}`);
        } finally {
            clearTimeout(timer);
        }
    }

    streamForPlace(placeId: string, heartbeatMs = HEARTBEAT_MS): Observable<StreamMessage> {
        return this.withHeartbeat(this.bus.pipe(filter((e) => e.placeId === placeId)), heartbeatMs);
    }

    streamForToken(publicToken: string, heartbeatMs = HEARTBEAT_MS): Observable<StreamMessage> {
        return this.withHeartbeat(this.bus.pipe(filter((e) => e.publicTokens.includes(publicToken))), heartbeatMs);
    }

    private withHeartbeat(events: Observable<OrderEvent>, heartbeatMs: number): Observable<StreamMessage> {
        const data = events.pipe(map((e) => ({ data: e })));
        if (!heartbeatMs) return data;
        return merge(data, interval(heartbeatMs).pipe(map(() => ({ data: { type: 'ping' as const } }))));
    }
}
