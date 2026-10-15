import { PinAttemptsService } from './pin-attempts.service';

const store = () => {
    const values = new Map<string, number>();
    const ttl = new Map<string, number>();
    return {
        values, ttl,
        get: jest.fn(async (key: string) => (values.has(key) ? String(values.get(key)) : null)),
        incr: jest.fn(async (key: string) => { values.set(key, (values.get(key) ?? 0) + 1); return values.get(key)!; }),
        expire: jest.fn(async (key: string, seconds: number) => { ttl.set(key, seconds); return 1; }),
        del: jest.fn(async (key: string) => Number(values.delete(key))),
        disconnect: jest.fn(),
    };
};

const build = (fake = store()) => {
    const svc = new PinAttemptsService({ get: () => undefined } as any, () => fake as any);
    svc.onModuleInit();
    return { svc, fake };
};

describe('PinAttemptsService', () => {
    it('cuenta fallos con vencimiento de 10 min fijado en el primer fallo', async () => {
        const { svc, fake } = build();
        await svc.registerFailure(['t1:ip']);
        await svc.registerFailure(['t1:ip']);
        expect(fake.values.get('pin:fail:t1:ip')).toBe(2);
        expect(fake.expire).toHaveBeenCalledTimes(1);
        expect(fake.ttl.get('pin:fail:t1:ip')).toBe(600);
    });

    it('bloquea al alcanzar el tope de cualquiera de las claves', async () => {
        const { svc } = build();
        for (let i = 0; i < 5; i++) await svc.registerFailure(['t1:ip']);
        await expect(svc.isLocked([{ key: 't1:ip', max: 5 }, { key: 't1', max: 15 }])).resolves.toBe(true);
        await expect(svc.isLocked([{ key: 't1:otra', max: 5 }, { key: 't1', max: 15 }])).resolves.toBe(false);
    });

    it('no hay tamaño máximo: miles de claves no borran un bloqueo existente', async () => {
        const { svc } = build();
        for (let i = 0; i < 5; i++) await svc.registerFailure(['t1:atacante']);
        for (let i = 0; i < 10_050; i++) await svc.registerFailure([`otra-${i}:ip-${i}`]);
        await expect(svc.isLocked([{ key: 't1:atacante', max: 5 }])).resolves.toBe(true);
    });

    it('si Redis no responde no bloquea (decisión explícita) y no lanza', async () => {
        const fake = store();
        fake.get.mockRejectedValue(new Error('redis caído'));
        fake.incr.mockRejectedValue(new Error('redis caído'));
        const { svc } = build(fake);
        await expect(svc.isLocked([{ key: 't1:ip', max: 5 }])).resolves.toBe(false);
        await expect(svc.registerFailure(['t1:ip'])).resolves.toBeUndefined();
    });
});
