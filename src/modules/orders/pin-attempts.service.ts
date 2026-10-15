import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Lo mínimo de Redis que usa el contador (inyectable para tests). */
export interface PinAttemptsStore {
    set(key: string, value: string, mode: 'EX', seconds: number, condition: 'NX'): Promise<'OK' | null>;
    incr(key: string): Promise<number>;
    decr(key: string): Promise<number>;
    disconnect(): void;
}

export const PIN_ATTEMPTS_STORE_FACTORY = 'PIN_ATTEMPTS_STORE_FACTORY';
const WINDOW_SECONDS = 10 * 60;

/**
 * Intentos de PIN en Redis, con vencimiento a los 10 min. Cada intento se cuenta ANTES de comparar el PIN
 * (así muchos intentos en paralelo no se cuelan antes de registrar el primer fallo) y se descuenta si el PIN
 * era correcto. La clave se crea con su vencimiento en un solo paso (SET NX EX): nunca queda sin TTL.
 */
@Injectable()
export class PinAttemptsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PinAttemptsService.name);
    private store: PinAttemptsStore;

    constructor(
        private readonly config: ConfigService,
        @Optional() @Inject(PIN_ATTEMPTS_STORE_FACTORY) private readonly createStore: (url: string) => PinAttemptsStore =
            (url) => new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false }) as unknown as PinAttemptsStore,
    ) { }

    onModuleInit() {
        this.store = this.createStore(this.config.get<string>('REDIS_URL') || 'redis://localhost:6379');
    }

    onModuleDestroy() {
        this.store?.disconnect();
    }

    /**
     * Registra un intento en cada clave y dice si se permite (ninguna superó su tope).
     * Si Redis no responde, aplica `onStoreError` ('allow' o 'deny').
     */
    async consume(limits: { key: string; max: number }[], onStoreError: 'allow' | 'deny'): Promise<boolean> {
        try {
            const counts = await Promise.all(limits.map(async (limit) => {
                const key = this.redisKey(limit.key);
                await this.store.set(key, '0', 'EX', WINDOW_SECONDS, 'NX');
                return this.store.incr(key);
            }));
            return counts.every((count, i) => count <= limits[i].max);
        } catch (err: any) {
            this.logger.error(`Contador de PIN no disponible (${onStoreError}): ${err?.message}`);
            return onStoreError === 'allow';
        }
    }

    /** Devuelve el intento consumido por un PIN correcto (no cuenta como fallo). */
    async refund(keys: string[]): Promise<void> {
        await Promise.all(keys.map((key) => this.store.decr(this.redisKey(key)).catch(() => undefined)));
    }

    private redisKey(key: string): string {
        return `pin:fail:${key}`;
    }
}
