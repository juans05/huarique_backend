import { PinAttemptsService } from './pin-attempts.service';

const store = () => {
    const values = new Map<string, number>();
    const ttl = new Map<string, number>();
    return {
        values, ttl,
        set: jest.fn(async (key: string, value: string, _mode: string, seconds: number) => {
            if (values.has(key)) return null;
            values.set(key, Number(value)); ttl.set(key, seconds); return 'OK';
        }),
        incr: jest.fn(async (key: string) => { values.set(key, (values.get(key) ?? 0) + 1); return values.get(key)!; }),
        decr: jest.fn(async (key: string) => { values.set(key, (values.get(key) ?? 0) - 1); return values.get(key)!; }),
        disconnect: jest.fn(),
    };
};

const build = (fake = store()) => {
    const svc = new PinAttemptsService({ get: () => undefined } as any, () => fake as any);
    svc.onModuleInit();
    return { svc, fake };
};

const limits = [{ key: 't1:ip', max: 5 }, { key: 't1', max: 15 }];

describe('PinAttemptsService', () => {
    it('la clave se crea con vencimiento de 10 min en un solo paso (nunca queda sin TTL)', async () => {
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

    it('un PIN correcto devuelve su intento', async () => {
        const { svc, fake } = build();
        await svc.consume(limits, 'allow');
        await svc.refund(['t1:ip', 't1']);
        expect(fake.values.get('pin:fail:t1:ip')).toBe(0);
    });

    it('si Redis no responde aplica la política indicada', async () => {
        const fake = store();
        fake.set.mockRejectedValue(new Error('redis caído'));
        const { svc } = build(fake);
        await expect(svc.consume(limits, 'allow')).resolves.toBe(true);
        await expect(svc.consume(limits, 'deny')).resolves.toBe(false);
    });
});
