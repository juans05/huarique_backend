import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Lo mínimo de Redis que usa el contador (inyectable para tests). */
export interface PinAttemptsStore {
    eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
    disconnect(): void;
}

// Scripts atómicos: el contador SIEMPRE tiene vencimiento (aunque haya vencido entre dos comandos) y nunca
// baja de cero ni se recrea al descontar.
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count`;
const REFUND_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 and tonumber(redis.call('GET', KEYS[1])) > 0 then
  return redis.call('DECR', KEYS[1])
end
return 0`;

export const PIN_ATTEMPTS_STORE_FACTORY = 'PIN_ATTEMPTS_STORE_FACTORY';
const WINDOW_SECONDS = 10 * 60;

/**
 * Intentos de PIN en Redis, con vencimiento a los 10 min. Cada intento se cuenta ANTES de comparar el PIN
 * (así muchos intentos en paralelo no se cuelan antes de registrar el primer fallo) y se descuenta si el PIN
 * era correcto. Conteo y descuento son scripts atómicos de Redis: el contador nunca queda sin vencimiento ni negativo.
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
            const counts = await Promise.all(limits.map(async (limit) =>
                Number(await this.store.eval(CONSUME_SCRIPT, 1, this.redisKey(limit.key), WINDOW_SECONDS))));
            return counts.every((count, i) => count <= limits[i].max);
        } catch (err: any) {
            this.logger.error(`Contador de PIN no disponible (${onStoreError}): ${err?.message}`);
            return onStoreError === 'allow';
        }
    }

    /** Devuelve el intento consumido por un PIN correcto (no cuenta como fallo). */
    async refund(keys: string[]): Promise<void> {
        await Promise.all(keys.map((key) => this.store.eval(REFUND_SCRIPT, 1, this.redisKey(key)).catch(() => undefined)));
    }

    private redisKey(key: string): string {
        return `pin:fail:${key}`;
    }
}
