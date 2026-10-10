import { clawbackFor, commissionForPayment, DEFAULT_COMMISSION_SETTINGS as S, periodEnd, validateSettings } from './commission-rules.util';

describe('commissionForPayment', () => {
    it('pago 1 → 70 % del monto cobrado', () => {
        expect(commissionForPayment(1, 19900, S)).toEqual({ type: 'first_month', monthNumber: 1, rate: 0.7, amount: 13930 });
    });
    it('pagos 2 a 7 → 10 %', () => {
        expect(commissionForPayment(2, 19900, S)).toEqual({ type: 'recurring', monthNumber: 2, rate: 0.1, amount: 1990 });
        expect(commissionForPayment(7, 49900, S)).toEqual({ type: 'recurring', monthNumber: 7, rate: 0.1, amount: 4990 });
    });
    it('pago 8 en adelante → nada', () => {
        expect(commissionForPayment(8, 19900, S)).toBeNull();
    });
    it('redondea al céntimo', () => {
        expect(commissionForPayment(1, 7999, S)!.amount).toBe(5599); // 5599.3
    });
    it('medio céntimo exacto no se pierde por float (45 × 0.7 = 31.5 → 32)', () => {
        expect(commissionForPayment(1, 45, S)!.amount).toBe(32);
    });
    it('medio céntimo exacto en recurrente (85 × 0.1 = 8.5 → 9)', () => {
        expect(commissionForPayment(2, 85, { ...S, recurringRate: 0.1 })!.amount).toBe(9);
    });
    it('otra configuración mueve los límites', () => {
        const c = { firstMonthRate: 0.5, recurringRate: 0.05, recurringMonths: 3, clawbackDays: 15 };
        expect(commissionForPayment(1, 10000, c)!.amount).toBe(5000);
        expect(commissionForPayment(4, 10000, c)!.amount).toBe(500);
        expect(commissionForPayment(5, 10000, c)).toBeNull();
    });
    it('recurring_months = 0 → solo primer mes', () => {
        expect(commissionForPayment(2, 10000, { ...S, recurringMonths: 0 })).toBeNull();
    });
    it('porcentaje 0 o monto inválido → sin línea', () => {
        expect(commissionForPayment(1, 10000, { ...S, firstMonthRate: 0 })).toBeNull();
        expect(commissionForPayment(1, 0, S)).toBeNull();
        expect(commissionForPayment(0, 10000, S)).toBeNull();
    });
});

describe('clawbackFor', () => {
    const first = { rate: 0.7, amount: 13930 };
    const paid = new Date('2026-11-01T15:00:00Z');
    it('cancela dentro de 30 días → línea negativa igual al primer mes', () => {
        expect(clawbackFor(first, paid, new Date('2026-11-20T00:00:00Z'), S)).toEqual({ type: 'clawback', monthNumber: 1, rate: -0.7, amount: -13930 });
    });
    it('cancela después de 30 días → nada', () => {
        expect(clawbackFor(first, paid, new Date('2026-12-05T00:00:00Z'), S)).toBeNull();
    });
    it('sin comisión de primer mes → nada', () => {
        expect(clawbackFor(null, paid, new Date('2026-11-02T00:00:00Z'), S)).toBeNull();
    });
    it('cancela exactamente a los 30 días → línea negativa', () => {
        expect(clawbackFor(first, paid, new Date(paid.getTime() + 30 * 24 * 60 * 60 * 1000), S)).toEqual({ type: 'clawback', monthNumber: 1, rate: -0.7, amount: -13930 });
    });
    it('cancela a los 30 días + 1 ms → nada', () => {
        expect(clawbackFor(first, paid, new Date(paid.getTime() + 30 * 24 * 60 * 60 * 1000 + 1), S)).toBeNull();
    });
    it('sin fecha de primer pago → nada', () => {
        expect(clawbackFor(first, null, new Date('2026-11-02T00:00:00Z'), S)).toBeNull();
    });
});

describe('validateSettings', () => {
    it('acepta valores en rango', () => {
        expect(validateSettings({ firstMonthRate: 0.5, recurringMonths: 12, clawbackDays: 0 })).toBeNull();
    });
    it('rechaza porcentajes fuera de 0–1 y meses/días fuera de rango', () => {
        expect(validateSettings({ firstMonthRate: 1.2 })).toMatch(/porcentaje/i);
        expect(validateSettings({ recurringRate: -0.1 })).toMatch(/porcentaje/i);
        expect(validateSettings({ recurringMonths: 37 })).toMatch(/meses/i);
        expect(validateSettings({ clawbackDays: 400 })).toMatch(/días/i);
        expect(validateSettings({ recurringMonths: 1.5 })).toMatch(/meses/i);
    });
});

describe('periodEnd', () => {
    it('noviembre 2026 cierra el 1 de diciembre 00:00 de Lima (05:00 UTC)', () => {
        expect(periodEnd('2026-11').toISOString()).toBe('2026-12-01T05:00:00.000Z');
    });
    it('diciembre pasa al año siguiente', () => {
        expect(periodEnd('2026-12').toISOString()).toBe('2027-01-01T05:00:00.000Z');
    });
    it('formato inválido → error', () => {
        expect(() => periodEnd('2026-13')).toThrow();
        expect(() => periodEnd('nov')).toThrow();
    });
});
