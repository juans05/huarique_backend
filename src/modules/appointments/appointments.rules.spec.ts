import { addDays, dayKey, dayLabel, freeSlots, limaDate, limaInstant, limaTime, timeLabel, workingWindow } from './appointments.rules';

const sat = '2026-10-24'; // sábado
const pro = (over: any = {}) => ({ schedule: [{ day: 'sat', open: '10:00', close: '12:00' }], daysOff: [], ...over });
const early = new Date('2026-10-01T00:00:00Z');

describe('hora de Lima', () => {
    it('convierte y nombra días y horas', () => {
        expect(limaInstant(sat, '10:00').toISOString()).toBe('2026-10-24T15:00:00.000Z');
        expect(limaDate(new Date('2026-10-25T03:00:00Z'))).toBe(sat); // 22:00 del sábado en Lima
        expect(limaTime(limaInstant(sat, '16:30'))).toBe('16:30');
        expect(dayKey(sat)).toBe('sat');
        expect(dayLabel(sat)).toBe('sábado 24');
        expect(timeLabel('16:00')).toBe('4:00 pm');
        expect(timeLabel('00:30')).toBe('12:30 am');
        expect(addDays(sat, 1)).toBe('2026-10-25');
    });
});

describe('workingWindow', () => {
    it('usa el horario propio, luego el del local y luego 9 a 20', () => {
        expect(workingWindow(pro(), null, sat)!.start.toISOString()).toBe('2026-10-24T15:00:00.000Z');
        expect(workingWindow(pro({ schedule: null }), [{ day: 'sat', open: '08:00', close: '13:00' }], sat)!.end.toISOString()).toBe('2026-10-24T18:00:00.000Z');
        expect(limaTime(workingWindow(pro({ schedule: null }), null, sat)!.start)).toBe('09:00');
    });
    it('no trabaja en su día libre ni en días fuera de su horario', () => {
        expect(workingWindow(pro({ daysOff: [sat] }), null, sat)).toBeNull();
        expect(workingWindow(pro(), null, '2026-10-25')).toBeNull(); // domingo
    });
});

describe('freeSlots', () => {
    const win = workingWindow(pro(), null, sat);
    it('el servicio completo debe entrar antes del cierre', () => {
        const slots = freeSlots(win, [], 60, early).map(limaTime);
        expect(slots[0]).toBe('10:00');
        expect(slots[slots.length - 1]).toBe('11:00');
    });
    it('no se cruza con otra cita', () => {
        const busy = [{ start: limaInstant(sat, '10:30'), end: limaInstant(sat, '11:00') }];
        expect(freeSlots(win, busy, 30, early).map(limaTime)).toEqual(['10:00', '11:00', '11:15', '11:30']);
    });
    it('no ofrece horarios ya pasados', () => {
        expect(freeSlots(win, [], 30, limaInstant(sat, '11:10')).map(limaTime)).toEqual(['11:15', '11:30']);
    });
    it('sin horario no hay cupos', () => {
        expect(freeSlots(null, [], 30, early)).toEqual([]);
    });
});
