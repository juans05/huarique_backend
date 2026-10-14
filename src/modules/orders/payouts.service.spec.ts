import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { limaMonthRange, limaPeriod } from './lima-period';

describe('lima-period', () => {
    it('00:30 del 1 de noviembre en Lima todavía es octubre en UTC−5 límites', () => {
        expect(limaPeriod(new Date('2026-11-01T04:59:00Z'))).toBe('2026-10');
        expect(limaPeriod(new Date('2026-11-01T05:00:00Z'))).toBe('2026-11');
        expect(limaMonthRange('2026-10')).toEqual({ start: new Date('2026-10-01T05:00:00Z'), end: new Date('2026-11-01T05:00:00Z') });
    });
});

const build = (payments: any[], payouts: any[] = []) => {
    const paymentsRepo = {
        createQueryBuilder: jest.fn(() => ({ where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getMany: jest.fn(async () => payments.filter((p) => !p.payoutId)) })),
        // Igual que `UPDATE ... WHERE id IN (...) AND payout_id IS NULL`.
        update: jest.fn(async (where: any, patch: any) => {
            const hits = payments.filter((p) => where.id._value.includes(p.id) && (where.payoutId?._type === 'isNull' ? p.payoutId === null : true));
            hits.forEach((p) => Object.assign(p, patch));
            return { affected: hits.length };
        }),
        find: jest.fn(async ({ where }: any) => payments.filter((p) => p.payoutId === where.payoutId)),
    };
    const payoutsRepo = {
        create: jest.fn((x: any) => x),
        save: jest.fn(async (x: any) => { const row = { id: x.id ?? `po${payouts.length + 1}`, ...x }; const i = payouts.findIndex((p) => p.id === row.id); if (i >= 0) payouts[i] = row; else payouts.push(row); return row; }),
        delete: jest.fn(async ({ id }: any) => { const i = payouts.findIndex((p) => p.id === id); if (i >= 0) payouts.splice(i, 1); }),
        findOne: jest.fn(async ({ where }: any) => payouts.find((p) => p.id === where.id) ?? null),
        update: jest.fn(async (where: any, patch: any) => { const hits = payouts.filter((p) => p.id === where.id && p.status === where.status); hits.forEach((p) => Object.assign(p, patch)); return { affected: hits.length }; }),
    };
    const settingsRepo = { findOne: jest.fn(async () => ({ wuarikesCommissionPct: 0.05 })) };
    return { svc: new PayoutsService(paymentsRepo as any, payoutsRepo as any, settingsRepo as any), paymentsRepo, payouts };
};

const pay = (id: string, amount: number, culqiFee: number) => ({ id, placeId: 'p1', amount, culqiFee, destination: 'WUARIKES', status: 'PAGADO', method: 'TARJETA', payoutId: null as string | null });

describe('PayoutsService.generate', () => {
    it('agrupa por local los pagos online a Wuarikes sin liquidar y descuenta comisión y fee', async () => {
        const { svc, paymentsRepo } = build([pay('a', 10000, 400), pay('b', 5000, 200)]);
        const [payout] = await svc.generate('2026-10');
        expect(payout).toMatchObject({ placeId: 'p1', period: '2026-10', gross: 15000, commission: 750, culqiFees: 600, net: 13650, status: 'BORRADOR' });
        expect(paymentsRepo.update).toHaveBeenCalledWith(expect.anything(), { payoutId: payout.id });
    });

    it('si otra corrida se llevó un pago entre la lectura y la toma, la liquidación solo cuenta lo tomado', async () => {
        const rows = [pay('a', 10000, 400), pay('b', 5000, 200)];
        const { svc, paymentsRepo, payouts } = build(rows);
        const update = paymentsRepo.update.getMockImplementation()!;
        paymentsRepo.update.mockImplementationOnce(async (where: any, patch: any) => { rows[1].payoutId = 'po-otra'; return update(where, patch); });
        const [payout] = await svc.generate('2026-10');
        expect(payout).toMatchObject({ gross: 10000, commission: 500, culqiFees: 400, net: 9100 });
        expect(payouts).toHaveLength(1);
        expect(rows[1].payoutId).toBe('po-otra');
    });

    it('correrlo dos veces no duplica', async () => {
        const { svc, payouts } = build([pay('a', 10000, 400)]);
        await svc.generate('2026-10');
        await expect(svc.generate('2026-10')).resolves.toEqual([]);
        expect(payouts).toHaveLength(1);
    });
});

describe('PayoutsService.markPaid', () => {
    it('solo desde BORRADOR', async () => {
        const { svc } = build([], [{ id: 'po1', status: 'BORRADOR' }, { id: 'po2', status: 'ANULADO' }]);
        await expect(svc.markPaid('po1', 'OP-1')).resolves.toMatchObject({ status: 'PAGADO', reference: 'OP-1' });
        await expect(svc.markPaid('po1', 'OP-2')).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.markPaid('po2', 'OP-3')).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.markPaid('nope', 'x')).rejects.toBeInstanceOf(NotFoundException);
    });
});
