// Reglas de comisión (spec comisiones §3). Puras: la configuración entra como parámetro.
export type CommissionType = 'first_month' | 'recurring' | 'clawback';

export interface CommissionSettingsValues {
    firstMonthRate: number;
    recurringRate: number;
    recurringMonths: number;
    clawbackDays: number;
}

export const DEFAULT_COMMISSION_SETTINGS: CommissionSettingsValues = {
    firstMonthRate: 0.7,
    recurringRate: 0.1,
    recurringMonths: 6,
    clawbackDays: 30,
};

export interface CommissionLine {
    type: CommissionType;
    monthNumber: number;
    rate: number;
    amount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function commissionForPayment(paymentNumber: number, baseAmount: number, s: CommissionSettingsValues): CommissionLine | null {
    if (paymentNumber < 1 || baseAmount <= 0) return null;
    let line: CommissionLine | null = null;
    if (paymentNumber === 1) {
        line = { type: 'first_month', monthNumber: 1, rate: s.firstMonthRate, amount: Math.round(baseAmount * s.firstMonthRate) };
    } else if (paymentNumber <= 1 + s.recurringMonths) {
        line = { type: 'recurring', monthNumber: paymentNumber, rate: s.recurringRate, amount: Math.round(baseAmount * s.recurringRate) };
    }
    return line && line.amount > 0 ? line : null;
}

export function clawbackFor(
    first: { rate: number; amount: number } | null,
    firstPaidAt: Date | null,
    canceledAt: Date,
    s: CommissionSettingsValues,
): CommissionLine | null {
    if (!first || !firstPaidAt || first.amount <= 0) return null;
    const elapsed = canceledAt.getTime() - firstPaidAt.getTime();
    if (elapsed < 0 || elapsed > s.clawbackDays * DAY_MS) return null;
    return { type: 'clawback', monthNumber: 1, rate: -first.rate, amount: -first.amount };
}

export function validateSettings(patch: Partial<CommissionSettingsValues>): string | null {
    const rate = (v: number | undefined) => v === undefined || (typeof v === 'number' && v >= 0 && v <= 1);
    const int = (v: number | undefined, max: number) => v === undefined || (Number.isInteger(v) && v >= 0 && v <= max);
    if (!rate(patch.firstMonthRate) || !rate(patch.recurringRate)) return 'Cada porcentaje debe estar entre 0 y 1 (ej. 0.70 = 70 %).';
    if (!int(patch.recurringMonths, 36)) return 'Los meses de comisión mensual deben ser un número entero entre 0 y 36.';
    if (!int(patch.clawbackDays, 365)) return 'Los días del descuento deben ser un número entero entre 0 y 365.';
    return null;
}

/** Primer instante del mes siguiente a `period` (YYYY-MM) en hora de Lima (UTC−5, sin horario de verano). */
export function periodEnd(period: string): Date {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    const year = m ? Number(m[1]) : NaN;
    const month = m ? Number(m[2]) : NaN; // 1-12
    if (!m || month < 1 || month > 12) throw new Error(`Período inválido: ${period} (usa YYYY-MM)`);
    return new Date(Date.UTC(year, month, 1, 5)); // Date.UTC normaliza mes 12 → enero del año siguiente
}
