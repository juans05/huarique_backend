import { CommissionsService } from './commissions.service';

const settingsRow = { id: 1, firstMonthRate: 0.7, recurringRate: 0.1, recurringMonths: 6, clawbackDays: 30, updatedAt: new Date(), updatedByUserId: null };

const build = (o: { sub?: any; seller?: any; payments?: any[]; settings?: any; firstEntry?: any; firstPayment?: any; saveError?: any } = {}) => {
    const settingsRepo = { findOne: jest.fn().mockResolvedValue(o.settings === undefined ? settingsRow : o.settings), save: jest.fn(async (x) => x) };
    const entriesRepo = {
        create: jest.fn((x) => x),
        save: o.saveError ? jest.fn().mockRejectedValue(o.saveError) : jest.fn(async (x) => ({ id: 'e1', ...x })),
        findOne: jest.fn().mockResolvedValue(o.firstEntry ?? null),
    };
    const subscriptionsRepo = { findOne: jest.fn().mockResolvedValue(o.sub ?? null) };
    const paymentsRepo = {
        find: jest.fn().mockResolvedValue(o.payments ?? []),
        findOne: jest.fn().mockResolvedValue(o.firstPayment ?? null),
    };
    const usersRepo = { findOne: jest.fn().mockResolvedValue(o.seller ?? null) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const svc = new CommissionsService(settingsRepo as any, entriesRepo as any, {} as any, subscriptionsRepo as any, paymentsRepo as any, usersRepo as any, audit as any, {} as any);
    return { svc, entriesRepo, settingsRepo, audit, paymentsRepo };
};

const sub = { id: 's1', placeId: 'p1', salesUserId: 'u1' };
const seller = { id: 'u1', role: 'sales' };
const pays = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `pay${i + 1}`, amount: 19900, status: 'paid', paidAt: new Date(2026, i, 1) }));

describe('CommissionsService.recordForPayment', () => {
    it('primer pago → línea first_month al 70 %', async () => {
        const { svc, entriesRepo } = build({ sub, seller, payments: pays(1) });
        await svc.recordForPayment('s1', 'pay1');
        expect(entriesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ salesUserId: 'u1', placeId: 'p1', subscriptionId: 's1', paymentId: 'pay1', type: 'first_month', monthNumber: 1, baseAmount: 19900, rate: 0.7, amount: 13930 }));
    });

    it('tercer pago → recurring al 10 % con número de mes 3', async () => {
        const { svc, entriesRepo } = build({ sub, seller, payments: pays(3) });
        await svc.recordForPayment('s1', 'pay3');
        expect(entriesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ type: 'recurring', monthNumber: 3, amount: 1990 }));
    });

    it('sin comercial en la suscripción → nada', async () => {
        const { svc, entriesRepo } = build({ sub: { ...sub, salesUserId: null }, seller, payments: pays(1) });
        expect(await svc.recordForPayment('s1', 'pay1')).toBeNull();
        expect(entriesRepo.save).not.toHaveBeenCalled();
    });

    it('comercial que ya no tiene rol sales → nada', async () => {
        const { svc, entriesRepo } = build({ sub, seller: { id: 'u1', role: 'user' }, payments: pays(1) });
        expect(await svc.recordForPayment('s1', 'pay1')).toBeNull();
        expect(entriesRepo.save).not.toHaveBeenCalled();
    });

    it('mismo pago procesado dos veces (clave única 23505) → se ignora sin error', async () => {
        const { svc } = build({ sub, seller, payments: pays(1), saveError: Object.assign(new Error('duplicate'), { code: '23505' }) });
        await expect(svc.recordForPayment('s1', 'pay1')).resolves.toBeNull();
    });

    it('otro error de base de datos sí se propaga', async () => {
        const { svc } = build({ sub, seller, payments: pays(1), saveError: new Error('db down') });
        await expect(svc.recordForPayment('s1', 'pay1')).rejects.toThrow('db down');
    });

    it('ordena pagos con el mismo paidAt por createdAt e id (desempate estable)', async () => {
        const { svc, paymentsRepo } = build({ sub, seller, payments: pays(1) });
        await svc.recordForPayment('s1', 'pay1');
        expect(paymentsRepo.find).toHaveBeenCalledWith(expect.objectContaining({ order: { paidAt: 'ASC', createdAt: 'ASC', id: 'ASC' } }));
    });

    it('usa la configuración vigente: con 50 % el primer mes da 9950', async () => {
        const { svc, entriesRepo } = build({ sub, seller, payments: pays(1), settings: { ...settingsRow, firstMonthRate: 0.5 } });
        await svc.recordForPayment('s1', 'pay1');
        expect(entriesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ rate: 0.5, amount: 9950 }));
    });

    it('sin fila de configuración usa los valores iniciales', async () => {
        const { svc, entriesRepo } = build({ sub, seller, payments: pays(1), settings: null });
        await svc.recordForPayment('s1', 'pay1');
        expect(entriesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ rate: 0.7, amount: 13930 }));
    });
});

describe('CommissionsService.recordClawbackIfNeeded', () => {
    const firstEntry = { id: 'e1', salesUserId: 'u1', placeId: 'p1', subscriptionId: 's1', paymentId: 'pay1', baseAmount: 19900, rate: 0.7, amount: 13930 };

    it('cancela a los 10 días del primer pago → línea negativa', async () => {
        const { svc, entriesRepo } = build({ firstEntry, firstPayment: { id: 'pay1', paidAt: new Date('2026-11-01T00:00:00Z') } });
        await svc.recordClawbackIfNeeded('s1', new Date('2026-11-11T00:00:00Z'));
        expect(entriesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ type: 'clawback', paymentId: 'pay1', amount: -13930, rate: -0.7 }));
    });

    it('cancela a los 40 días → nada', async () => {
        const { svc, entriesRepo } = build({ firstEntry, firstPayment: { id: 'pay1', paidAt: new Date('2026-11-01T00:00:00Z') } });
        expect(await svc.recordClawbackIfNeeded('s1', new Date('2026-12-11T00:00:00Z'))).toBeNull();
        expect(entriesRepo.save).not.toHaveBeenCalled();
    });

    it('sin comisión de primer mes → nada', async () => {
        const { svc, entriesRepo } = build({});
        expect(await svc.recordClawbackIfNeeded('s1', new Date())).toBeNull();
        expect(entriesRepo.save).not.toHaveBeenCalled();
    });
});

describe('CommissionsService.updateSettings', () => {
    it('rechaza valores fuera de rango', async () => {
        const { svc, settingsRepo } = build({});
        await expect(svc.updateSettings({ firstMonthRate: 1.5 }, 'admin1')).rejects.toThrow(/porcentaje/i);
        expect(settingsRepo.save).not.toHaveBeenCalled();
    });

    it('ignora valores null/undefined/vacíos en vez de convertirlos en 0', async () => {
        const { svc, settingsRepo } = build({});
        await svc.updateSettings({ firstMonthRate: null as any, recurringRate: 0.2 }, 'admin1');
        expect(settingsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ firstMonthRate: 0.7, recurringRate: 0.2 }));
    });

    it('rechaza valores no numéricos', async () => {
        const { svc, settingsRepo } = build({});
        await expect(svc.updateSettings({ firstMonthRate: 'abc' as any }, 'admin1')).rejects.toThrow();
        expect(settingsRepo.save).not.toHaveBeenCalled();
    });

    it('guarda, registra quién cambió y deja auditoría con antes/después', async () => {
        const { svc, settingsRepo, audit } = build({});
        const r = await svc.updateSettings({ firstMonthRate: 0.5 }, 'admin1');
        expect(settingsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1, firstMonthRate: 0.5, updatedByUserId: 'admin1' }));
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'commission_settings.updated', userId: 'admin1', metadata: expect.objectContaining({ before: expect.objectContaining({ firstMonthRate: 0.7 }), after: expect.objectContaining({ firstMonthRate: 0.5 }) }) }));
        expect(r.firstMonthRate).toBe(0.5);
    });
});
