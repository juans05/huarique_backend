import { PayoutsService } from './payouts.service';
import { limaMonthRange, limaPeriod } from './lima-period';

describe('lima-period', () => {
    it('00:30 del 1 de noviembre en Lima todavía es octubre en UTC−5 límites', () => {
        expect(limaPeriod(new Date('2026-11-01T04:59:00Z'))).toBe('2026-10');
        expect(limaPeriod(new Date('2026-11-01T05:00:00Z'))).toBe('2026-11');
        expect(limaMonthRange('2026-10')).toEqual({ start: new Date('2026-10-01T05:00:00Z'), end: new Date('2026-11-01T05:00:00Z') });
    });
});

describe('PayoutsService.generate', () => {
    it('agrupa por local los pagos online a Wuarikes sin liquidar y descuenta comisión y fee', async () => {
        const payments = [
            { id: 'a', placeId: 'p1', amount: 10000, culqiFee: 400, destination: 'WUARIKES', status: 'PAGADO', method: 'TARJETA', payoutId: null },
            { id: 'b', placeId: 'p1', amount: 5000, culqiFee: 200, destination: 'WUARIKES', status: 'PAGADO', method: 'YAPE', payoutId: null },
        ];
        const paymentsRepo = { createQueryBuilder: jest.fn(() => ({ where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getMany: jest.fn(async () => payments) })), update: jest.fn() };
        const payoutsRepo = { create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => ({ id: 'po1', ...x })) };
        const settingsRepo = { findOne: jest.fn(async () => ({ wuarikesCommissionPct: 0.05 })) };
        const svc = new PayoutsService(paymentsRepo as any, payoutsRepo as any, settingsRepo as any);
        const [payout] = await svc.generate('2026-10');
        expect(payout).toMatchObject({ placeId: 'p1', period: '2026-10', gross: 15000, commission: 750, culqiFees: 600, net: 13650, status: 'BORRADOR' });
        expect(paymentsRepo.update).toHaveBeenCalledWith(expect.anything(), { payoutId: 'po1' });
    });
});
