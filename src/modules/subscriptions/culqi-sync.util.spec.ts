import { decideSync, splitFullName } from './culqi-sync.util';

const now = new Date('2026-11-20T12:00:00Z');
const secs = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const active = (end: string) => ({ status: 'active', currentPeriodEnd: new Date(end) });

describe('decideSync (formato /v2/recurrent/subscriptions)', () => {
    it('la próxima fecha de cobro avanzó → cobró: registra pago y extiende', () => {
        const r = decideSync(active('2026-11-09T00:00:00Z'), { status: 3, next_billing_date: secs('2026-12-09T00:00:00Z'), periods: { charges: { charge_id: 'chr_live_1' } } }, now);
        expect(r).toEqual({ kind: 'renewed', periodStart: new Date('2026-11-09T00:00:00Z'), periodEnd: new Date('2026-12-09T00:00:00Z'), chargeId: 'chr_live_1' });
    });

    it('misma fecha, dentro del plazo → nada', () => {
        expect(decideSync(active('2026-11-19T00:00:00Z'), { status: 3, next_billing_date: secs('2026-11-19T00:00:00Z') }, now)).toEqual({ kind: 'none' });
    });

    it('diferencia de horas con el alta no cuenta como cobro', () => {
        expect(decideSync(active('2026-12-09T00:00:00Z'), { status: 3, next_billing_date: secs('2026-12-09T05:00:00Z') }, now)).toEqual({ kind: 'none' });
    });

    it('venció hace más de 3 días sin cobrar → pago pendiente', () => {
        expect(decideSync(active('2026-11-10T00:00:00Z'), { status: 3, next_billing_date: secs('2026-11-10T00:00:00Z') }, now)).toEqual({ kind: 'past_due' });
    });

    it('Culqi la marca vencida (6) → pago pendiente, una sola vez', () => {
        expect(decideSync(active('2026-12-09T00:00:00Z'), { status: 6 }, now)).toEqual({ kind: 'past_due' });
        expect(decideSync({ status: 'past_due', currentPeriodEnd: new Date('2026-12-09T00:00:00Z') }, { status: 6 }, now)).toEqual({ kind: 'none' });
    });

    it('pago pendiente que luego cobra → vuelve a activo', () => {
        const r = decideSync({ status: 'past_due', currentPeriodEnd: new Date('2026-11-10T00:00:00Z') }, { status: 3, next_billing_date: secs('2026-12-10T00:00:00Z'), periods: { charges: { charge_id: 'chr_live_2' } } }, now);
        expect(r.kind).toBe('renewed');
    });

    it('la fecha avanzó pero no hay cargo → no se marca como pagada', () => {
        expect(decideSync(active('2026-11-19T00:00:00Z'), { status: 3, next_billing_date: secs('2026-12-19T00:00:00Z') }, now)).toEqual({ kind: 'none' });
    });

    it('primer cobro que nunca llega (pending) → pago pendiente tras el plazo', () => {
        expect(decideSync({ status: 'pending', currentPeriodEnd: new Date('2026-11-10T00:00:00Z') }, { status: 1, next_billing_date: secs('2026-11-10T00:00:00Z') }, now)).toEqual({ kind: 'past_due' });
    });

    it('cancelada en Culqi (4) → cancelada', () => {
        expect(decideSync(active('2026-12-09T00:00:00Z'), { status: 4 }, now)).toEqual({ kind: 'canceled' });
    });

    it('respuesta sin fecha de cobro → no toca nada (no bloquea a quien paga)', () => {
        expect(decideSync(active('2026-11-01T00:00:00Z'), { status: 3 }, now)).toEqual({ kind: 'none' });
    });
});

describe('splitFullName', () => {
    it('separa nombre y apellidos', () => {
        expect(splitFullName('Juan Pérez Soto', 'X')).toEqual({ firstName: 'Juan', lastName: 'Pérez Soto' });
        expect(splitFullName('Juan', 'X')).toEqual({ firstName: 'Juan', lastName: 'Juan' });
        expect(splitFullName('  ', 'Cevichería')).toEqual({ firstName: 'Cevichería', lastName: 'Cevichería' });
    });
});
