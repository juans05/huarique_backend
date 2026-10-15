import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Lo mínimo de Redis que usa el contador (inyectable para tests). */
export interface PinAttemptsStore {
    get(key: string): Promise<string | null>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    del(key: string): Promise<number>;
    disconnect(): void;
}

export const PIN_ATTEMPTS_STORE_FACTORY = 'PIN_ATTEMPTS_STORE_FACTORY';
const WINDOW_SECONDS = 10 * 60;

/**
 * Contadores de PIN incorrectos en Redis, con vencimiento a los 10 min desde el primer fallo.
 * A diferencia de un mapa en memoria no hay tamaño máximo ni nada que descartar (un atacante que rota IPs
 * no puede borrar contadores ni bloqueos) y se comparte entre todas las réplicas.
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

    /** ¿Alguna de las claves alcanzó su tope en la ventana vigente? */
    async isLocked(limits: { key: string; max: number }[]): Promise<boolean> {
        try {
            const counts = await Promise.all(limits.map((limit) => this.store.get(this.redisKey(limit.key))));
            return counts.some((count, i) => Number(count ?? 0) >= limits[i].max);
        } catch (err: any) {
            // Decisión explícita: si Redis no responde no se bloquea a los comensales (el PIN sigue exigiéndose
            // y el rate limit por IP sigue activo); queda registrado para revisarlo.
            this.logger.error(`No se pudo leer el contador de PIN: ${err?.message}`);
            return false;
        }
    }

    async registerFailure(keys: string[]): Promise<void> {
        try {
            await Promise.all(keys.map(async (key) => {
                const count = await this.store.incr(this.redisKey(key));
                if (count === 1) await this.store.expire(this.redisKey(key), WINDOW_SECONDS);
            }));
        } catch (err: any) {
            this.logger.error(`No se pudo registrar el fallo de PIN: ${err?.message}`);
        }
    }

    async reset(key: string): Promise<void> {
        await this.store.del(this.redisKey(key)).catch(() => undefined);
    }

    private redisKey(key: string): string {
        return `pin:fail:${key}`;
    }
}
