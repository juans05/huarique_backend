import { firstValueFrom, take, toArray } from 'rxjs';
import { OrderEventsService, OrderEvent } from './order-events.service';

class FakeRedisBus {
    static listeners: ((channel: string, message: string) => void)[] = [];
    async publish(channel: string, message: string) { FakeRedisBus.listeners.forEach((fn) => fn(channel, message)); return 1; }
    async subscribe() { return 1; }
    on(_event: 'message', fn: (channel: string, message: string) => void) { FakeRedisBus.listeners.push(fn); return this; }
    duplicate() { return new FakeRedisBus(); }
    disconnect() { }
}

const config = { get: () => 'redis://fake' } as any;
const build = () => {
    const svc = new OrderEventsService(config, () => new FakeRedisBus() as any);
    svc.onModuleInit();
    return svc;
};

describe('OrderEventsService', () => {
    beforeEach(() => { FakeRedisBus.listeners = []; });

    it('entrega a la sede correcta y no a otra', async () => {
        const svc = build();
        const received = firstValueFrom(svc.streamForPlace('p1', 0).pipe(take(1)));
        const other: OrderEvent[] = [];
        svc.streamForPlace('p2', 0).subscribe((m) => other.push(m.data as OrderEvent));
        await svc.publish({ type: 'order.created', placeId: 'p1', orderId: 'o1', publicTokens: ['t1'] });
        expect((await received).data).toMatchObject({ type: 'order.created', orderId: 'o1' });
        expect(other).toHaveLength(0);
    });

    it('el cliente solo recibe eventos de su token', async () => {
        const svc = build();
        const got = firstValueFrom(svc.streamForToken('tok-a', 0).pipe(take(1), toArray()));
        await svc.publish({ type: 'order.status_changed', placeId: 'p1', status: 'LISTO', publicTokens: ['tok-b'] });
        await svc.publish({ type: 'order.status_changed', placeId: 'p1', status: 'NUEVO', publicTokens: ['tok-a'] });
        expect((await got)[0].data).toMatchObject({ status: 'NUEVO' });
    });

    it('publish no bloquea ni lanza si Redis falla o no responde', async () => {
        const failing = new OrderEventsService(config, () => ({ ...new FakeRedisBus(), publish: async () => { throw new Error('down'); }, duplicate: () => new FakeRedisBus() }) as any);
        failing.onModuleInit();
        await expect(failing.publish({ type: 'order.created', placeId: 'p1', publicTokens: [] })).resolves.toBeUndefined();

        jest.useFakeTimers();
        try {
            const hanging = new OrderEventsService(config, () => ({ ...new FakeRedisBus(), publish: () => new Promise(() => undefined), duplicate: () => new FakeRedisBus() }) as any);
            hanging.onModuleInit();
            const done = hanging.publish({ type: 'order.created', placeId: 'p1', publicTokens: [] });
            await jest.advanceTimersByTimeAsync(1000);
            await expect(done).resolves.toBeUndefined();
        } finally {
            jest.useRealTimers();
        }
    });
});
