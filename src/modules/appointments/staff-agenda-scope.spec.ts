import { ForbiddenException } from '@nestjs/common';
import { StaffAgendaController } from './appointments.controller';

// Un barbero de barbería (alcance propio) no ve clientes del local: ni rutinas por volver ni fichas.
const own = { scope: 'own', professionalId: 'p1' };
const make = (scope: any) => {
    const agenda = {
        assertEnabled: jest.fn(), agendaScope: jest.fn().mockResolvedValue(scope),
        range: jest.fn().mockResolvedValue({ appointments: [] }), assets: jest.fn(), saveAsset: jest.fn(),
    };
    const recall = { dueByDay: jest.fn().mockResolvedValue({ '2026-10-27': 3 }), upcoming: jest.fn(), notifyNow: jest.fn() };
    return { ctrl: new StaffAgendaController(agenda as any, {} as any, recall as any), agenda, recall };
};
const req = { placeTeamMember: { role: 'agente' } };

describe('StaffAgendaController con alcance propio', () => {
    it('range no trae rutinas por volver', async () => {
        const { ctrl, recall } = make(own);
        const res = await ctrl.range('pl1', { from: '2026-10-26', to: '2026-11-01' } as any, req);
        expect(res.recallDue).toEqual({});
        expect(recall.dueByDay).not.toHaveBeenCalled();
    });
    it('range con alcance total sí las trae', async () => {
        const { ctrl } = make({ scope: 'all', professionalId: null });
        expect((await ctrl.range('pl1', { from: '2026-10-26', to: '2026-11-01' } as any, req)).recallDue).toEqual({ '2026-10-27': 3 });
    });
    it('rutinas, aviso de rutina y fichas → 403', async () => {
        const { ctrl } = make(own);
        await expect(ctrl.recallUpcoming('pl1', req)).rejects.toThrow(ForbiddenException);
        await expect(ctrl.recallNotify('pl1', 'a1', req)).rejects.toThrow(ForbiddenException);
        await expect(ctrl.assets('pl1', req, '987')).rejects.toThrow(ForbiddenException);
        await expect(ctrl.createAsset('pl1', {} as any, req)).rejects.toThrow(ForbiddenException);
        await expect(ctrl.updateAsset('pl1', 'x', {} as any, req)).rejects.toThrow(ForbiddenException);
    });
});
