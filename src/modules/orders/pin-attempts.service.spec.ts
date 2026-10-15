import { PinAttemptsService } from './pin-attempts.service';

// Redis en memoria que emula los scripts de conteo (INCR + TTL) y descuento (DECR sin bajar de 0).
const store = () => {
    const values = new Map<string, number>();
    const ttl = new Map<string, number>();
    return {
        values, ttl,
        eval: async (script: string, _n: number, key: string, seconds?: number) => {
            if (script.includes('INCR')) {
                values.set(key, (values.get(key) ?? 0) + 1);
                if (!ttl.has(key)) ttl.set(key, Number(seconds));
                return values.get(key)!;
            }
            if (values.has(key) && values.get(key)! > 0) { values.set(key, values.get(key)! - 1); return values.get(key)!; }
            return 0;
        },
        disconnect: () => undefined,
    };
};

const build = (fake: any = store()) => {
    const svc = new PinAttemptsService({ get: () => undefined } as any, () => fake);
    svc.onModuleInit();
    return { svc, fake };
};

const limits = [{ key: 't1:ip', max: 5 }, { key: 't1', max: 15 }];

describe('PinAttemptsService', () => {
    it('el conteo es un script atómico que fija el vencimiento de 10 min', async () => {
        const { svc, fake } = build();
        await svc.consume(limits, 'allow');
        await svc.consume(limits, 'allow');
        expect(fake.ttl.get('pin:fail:t1:ip')).toBe(600);
        expect(fake.values.get('pin:fail:t1:ip')).toBe(2);
    });

    it('cuenta el intento antes de comparar: el sexto intento ya no se permite', async () => {
        const { svc } = build();
        for (let i = 0; i < 5; i++) await expect(svc.consume(limits, 'allow')).resolves.toBe(true);
        await expect(svc.consume(limits, 'allow')).resolves.toBe(false);
    });

    it('intentos en paralelo no se cuelan más allá del tope', async () => {
        const { svc } = build();
        const results = await Promise.all(Array.from({ length: 20 }, () => svc.consume(limits, 'allow')));
        expect(results.filter(Boolean)).toHaveLength(5);
    });

    it('descontar un contador vencido no crea una clave negativa ni sin vencimiento', async () => {
        const { svc, fake } = build();
        await svc.refund(['t1:ip']);
        expect(fake.values.has('pin:fail:t1:ip')).toBe(false);
        await svc.consume(limits, 'allow');
        await svc.refund(['t1:ip']);
        await svc.refund(['t1:ip']);
        expect(fake.values.get('pin:fail:t1:ip')).toBe(0);
    });

    it('si Redis no responde aplica la política indicada', async () => {
        const fake = store();
        (fake as any).eval = async () => { throw new Error('redis caído'); };
        const { svc } = build(fake);
        await expect(svc.consume(limits, 'allow')).resolves.toBe(true);
        await expect(svc.consume(limits, 'deny')).resolves.toBe(false);
    });
});
