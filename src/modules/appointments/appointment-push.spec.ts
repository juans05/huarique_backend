import { AppointmentPush, whenLabel } from './appointment-push';
import { limaInstant } from './appointments.rules';

const now = limaInstant('2026-10-27', '09:00'); // martes
const appt = { id: 'a1', placeId: 'pl1', customerName: 'Luis Ramos', serviceName: 'Corte', startsAt: limaInstant('2026-10-28', '11:00') };

const make = (row: any) => {
    const ds = { query: jest.fn().mockResolvedValue(row ? [row] : []) };
    const push = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
    return { svc: new AppointmentPush(ds as any, push as any), ds, push };
};
const barberia = { business_type: 'barberia', owner: 'u-owner', managers: ['u-admin', 'u-owner'] };

describe('whenLabel', () => {
    it('hoy, mañana o el día con nombre, en hora de Lima', () => {
        expect(whenLabel(limaInstant('2026-10-27', '16:30'), now)).toBe('hoy a las 4:30 pm');
        expect(whenLabel(limaInstant('2026-10-28', '11:00'), now)).toBe('mañana a las 11:00 am');
        expect(whenLabel(limaInstant('2026-10-31', '10:00'), now)).toBe('sábado 31 a las 10:00 am');
    });
});

describe('AppointmentPush.onBooked', () => {
    it('avisa al dueño, encargados y al barbero, sin repetidos', async () => {
        const { svc, push } = make(barberia);
        await svc.onBooked(appt, 'u-barber', now);
        expect(push.sendToUsers).toHaveBeenCalledWith(
            ['u-owner', 'u-admin', 'u-barber'],
            { title: 'Nueva reserva', body: 'Luis Ramos reservó Corte para mañana a las 11:00 am', data: { appointmentId: 'a1', placeId: 'pl1', kind: 'nueva' } },
        );
    });
    it('en un local que no es barbería no avisa', async () => {
        const { svc, push } = make({ ...barberia, business_type: 'veterinaria' });
        await svc.onBooked(appt, 'u-barber', now);
        expect(push.sendToUsers).not.toHaveBeenCalled();
    });
    it('si falla la consulta no lanza', async () => {
        const { svc, ds } = make(barberia);
        ds.query.mockRejectedValue(new Error('bd caída'));
        await expect(svc.onBooked(appt, null, now)).resolves.toBeUndefined();
    });
});

describe('AppointmentPush.onTransferred', () => {
    it('avisa solo al nuevo barbero', async () => {
        const { svc, push } = make(barberia);
        await svc.onTransferred(appt, 'u-nuevo', now);
        expect(push.sendToUsers).toHaveBeenCalledWith(
            ['u-nuevo'],
            { title: 'Te pasaron una cita', body: 'Luis Ramos · Corte · mañana a las 11:00 am', data: { appointmentId: 'a1', placeId: 'pl1', kind: 'traspaso' } },
        );
    });
    it('si el nuevo barbero no tiene cuenta no avisa', async () => {
        const { svc, push } = make(barberia);
        await svc.onTransferred(appt, null, now);
        expect(push.sendToUsers).not.toHaveBeenCalled();
    });
});
