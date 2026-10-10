import { CommissionsService } from './commissions.service';

// Simula un EntityManager de transacción con las líneas en memoria.
const buildWithEntries = (entries: any[], payouts: any[] = []) => {
    const created: any[] = [];
    const manager = {
        find: jest.fn(async (_entity: any, opts: any) => {
            const w = opts.where;
            const end = w.createdAt.value; // LessThan(end)
            return entries.filter((e) => e.salesUserId === w.salesUserId && e.payoutId === null && e.createdAt < end);
        }),
        create: jest.fn((_e: any, x: any) => x),
        save: jest.fn(async (_e: any, x: any) => {
            const p = { id: `po${created.length + 1}`, ...x };
            created.push(p);
            return p;
        }),
        update: jest.fn(async (_e: any, ids: string[], patch: any) => {
            entries.filter((e) => ids.includes(e.id)).forEach((e) => Object.assign(e, patch));
        }),
    };
    const qb: any = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn(async () => [...new Set(entries.filter((e) => e.payoutId === null).map((e) => e.salesUserId))].map((salesUserId) => ({ salesUserId }))),
    };
    const entriesRepo = { createQueryBuilder: jest.fn(() => qb) };
    const payoutsRepo = {
        findOne: jest.fn(async ({ where }: any) => payouts.find((p) => p.id === where.id) ?? null),
        save: jest.fn(async (x: any) => x),
        delete: jest.fn(async () => undefined),
    };
    const dataSource = { transaction: jest.fn(async (fn: any) => fn(manager)) };
    const svc = new CommissionsService({} as any, entriesRepo as any, payoutsRepo as any, {} as any, {} as any, {} as any, { log: jest.fn() } as any, dataSource as any);
    return { svc, created, entries, payoutsRepo, manager };
};

const line = (id: string, salesUserId: string, amount: number, createdAt: string, payoutId: string | null = null) => ({ id, salesUserId, amount, createdAt: new Date(createdAt), payoutId });

describe('CommissionsService.generatePayouts', () => {
    it('crea una liquidación por comercial con las líneas del período (hora de Lima)', async () => {
        const entries = [
            line('e1', 'u1', 13930, '2026-11-10T12:00:00Z'),
            line('e2', 'u1', 1990, '2026-12-01T04:59:59Z'), // 30 nov 23:59 en Lima → entra
            line('e3', 'u1', 1990, '2026-12-01T05:00:00Z'), // 1 dic 00:00 en Lima → no entra
            line('e4', 'u2', 5599, '2026-11-15T12:00:00Z'),
        ];
        const { svc, created } = buildWithEntries(entries);
        const result = await svc.generatePayouts('2026-11');
        expect(result).toHaveLength(2);
        expect(created.find((p) => p.salesUserId === 'u1')).toEqual(expect.objectContaining({ period: '2026-11', totalAmount: 15920, status: 'pending' }));
        expect(entries.find((e) => e.id === 'e3')!.payoutId).toBeNull();
    });

    it('total ≤ 0 (descuentos mayores que lo ganado) → no crea liquidación y deja las líneas', async () => {
        const entries = [line('e1', 'u1', 1990, '2026-11-10T12:00:00Z'), line('e2', 'u1', -13930, '2026-11-12T12:00:00Z')];
        const { svc, created } = buildWithEntries(entries);
        expect(await svc.generatePayouts('2026-11')).toHaveLength(0);
        expect(created).toHaveLength(0);
        expect(entries.every((e) => e.payoutId === null)).toBe(true);
    });

    it('generar el mismo mes dos veces solo toma líneas nuevas', async () => {
        const entries = [line('e1', 'u1', 13930, '2026-11-10T12:00:00Z')];
        const { svc, created } = buildWithEntries(entries);
        await svc.generatePayouts('2026-11');
        expect(await svc.generatePayouts('2026-11')).toHaveLength(0);
        expect(created).toHaveLength(1);
    });

    it('período inválido → error 400', async () => {
        const { svc } = buildWithEntries([]);
        await expect(svc.generatePayouts('2026-13')).rejects.toThrow(/Período inválido/);
    });
});

describe('CommissionsService: pagar y anular', () => {
    it('marca pagada con fecha, admin y nota', async () => {
        const { svc, payoutsRepo } = buildWithEntries([], [{ id: 'po1', status: 'pending' }]);
        const r = await svc.markPaid('po1', 'admin1', 'BCP op. 123');
        expect(payoutsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', paidByUserId: 'admin1', note: 'BCP op. 123', paidAt: expect.any(Date) }));
        expect(r.status).toBe('paid');
    });

    it('no se puede pagar ni anular una ya pagada', async () => {
        const { svc } = buildWithEntries([], [{ id: 'po1', status: 'paid' }]);
        await expect(svc.markPaid('po1', 'admin1')).rejects.toThrow(/ya está pagada/);
        await expect(svc.cancelPayout('po1')).rejects.toThrow(/ya está pagada/);
    });

    it('anular una pendiente la borra (las líneas quedan libres por ON DELETE SET NULL)', async () => {
        const { svc, payoutsRepo } = buildWithEntries([], [{ id: 'po1', status: 'pending' }]);
        await svc.cancelPayout('po1');
        expect(payoutsRepo.delete).toHaveBeenCalledWith('po1');
    });
});
