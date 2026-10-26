import { recallDates, shouldNotify, whenLabel } from './recall.service';

// Última visita: martes 1 de septiembre de 2026, 4:00 pm en Lima (21:00 UTC).
const VISIT = new Date('2026-09-01T21:00:00Z');
const ok = { notified: false, hasFuture: false, optedOut: false, verified: true };

describe('recallDates', () => {
    it('cuenta desde la última visita (fecha de Lima) y avisa N días antes', () => {
        expect(recallDates(VISIT, 20, 2)).toEqual({ last: '2026-09-01', due: '2026-09-21', notice: '2026-09-19' });
        expect(recallDates(VISIT, 20, null).notice).toBe('2026-09-19'); // por defecto 2 días antes
        expect(recallDates(VISIT, 20, 0).notice).toBe('2026-09-21');
    });

    it('una cita a las 11 pm de Lima cuenta para ese día, no para el siguiente (UTC)', () => {
        expect(recallDates(new Date('2026-09-02T04:00:00Z'), 10, 0).last).toBe('2026-09-01');
    });
});

describe('shouldNotify', () => {
    const d = recallDates(VISIT, 20, 2);

    it('avisa desde el día de aviso hasta 30 días después de que le tocaba', () => {
        expect(shouldNotify('2026-09-18', d, ok)).toBe(false);
        expect(shouldNotify('2026-09-19', d, ok)).toBe(true);
        expect(shouldNotify('2026-10-21', d, ok)).toBe(true);
        expect(shouldNotify('2026-10-22', d, ok)).toBe(false);
    });

    it('no avisa si ya se le avisó por esa visita, si tiene cita, si escribió BAJA o si el número no está verificado', () => {
        expect(shouldNotify('2026-09-20', d, { ...ok, notified: true })).toBe(false);
        expect(shouldNotify('2026-09-20', d, { ...ok, hasFuture: true })).toBe(false);
        expect(shouldNotify('2026-09-20', d, { ...ok, optedOut: true })).toBe(false);
        expect(shouldNotify('2026-09-20', d, { ...ok, verified: false })).toBe(false);
    });

    it('si vuelve antes, la nueva visita reinicia el conteo', () => {
        const again = recallDates(new Date('2026-09-15T21:00:00Z'), 20, 2);
        expect(shouldNotify('2026-09-19', again, ok)).toBe(false);
        expect(again.notice).toBe('2026-10-03');
    });
});

describe('whenLabel', () => {
    it('se lee natural según cuánto falta', () => {
        expect(whenLabel('2026-09-19', '2026-09-21')).toBe('en 2 días');
        expect(whenLabel('2026-09-20', '2026-09-21')).toBe('mañana');
        expect(whenLabel('2026-09-21', '2026-09-21')).toBe('hoy');
        expect(whenLabel('2026-09-25', '2026-09-21')).toBe('ya');
    });
});
