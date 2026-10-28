import { UpcomingPushService } from './upcoming-push.service';
import { limaInstant } from './appointments.rules';

const row = { id: 'a1', place_id: 'pl1', customer_name: 'Juan Pérez', service_name: 'Corte + barba', starts_at: limaInstant('2026-10-27', '10:00'), team_user_id: 'u-barber' };

const make = (rowsPerCall: any[][]) => {
    const ds = { query: jest.fn() };
    // Como el driver de Postgres: UPDATE ... RETURNING devuelve [filas, cantidad].
    rowsPerCall.forEach((rows) => ds.query.mockResolvedValueOnce([rows, rows.length]));
    ds.query.mockResolvedValue([[], 0]);
    const push = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
    return { svc: new UpcomingPushService(ds as any, push as any), ds, push };
};

describe('UpcomingPushService.run', () => {
    it('envía una push "Ya te toca" por cita devuelta', async () => {
        const { svc, push } = make([[row, { ...row, id: 'a2', team_user_id: 'u-otro' }]]);
        await svc.run();
        expect(push.sendToUsers).toHaveBeenCalledTimes(2);
        expect(push.sendToUsers).toHaveBeenCalledWith(['u-barber'], {
            title: 'Ya te toca', body: 'Juan Pérez · Corte + barba a las 10:00 am', data: { appointmentId: 'a1', placeId: 'pl1', kind: 'te_toca' },
        });
    });

    it('sin citas no envía', async () => {
        const { svc, push } = make([[]]);
        await svc.run();
        expect(push.sendToUsers).not.toHaveBeenCalled();
    });

    it('marca y selecciona en una sola consulta: dos corridas seguidas avisan una vez', async () => {
        const { svc, ds, push } = make([[row]]);
        await svc.run();
        await svc.run();
        expect(push.sendToUsers).toHaveBeenCalledTimes(1);
        const sql: string = ds.query.mock.calls[0][0];
        expect(sql).toMatch(/UPDATE wuarike_db\.appointments/);
        expect(sql).toMatch(/upcoming_pushed_at IS NULL/);
        expect(sql).toMatch(/RETURNING/);
    });

    it('no corre en paralelo', async () => {
        const { svc, ds } = make([]);
        let release!: (v: any) => void;
        ds.query.mockReset().mockReturnValueOnce(new Promise((r) => { release = r; }));
        const first = svc.run();
        await svc.run();
        expect(ds.query).toHaveBeenCalledTimes(1);
        release([[], 0]);
        await first;
    });

    it('si falla la consulta no lanza', async () => {
        const { svc, ds } = make([]);
        ds.query.mockReset().mockRejectedValue(new Error('bd caída'));
        await expect(svc.run()).resolves.toBeUndefined();
    });
});
