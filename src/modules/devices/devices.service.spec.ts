import { BadRequestException } from '@nestjs/common';
import { DevicesService } from './devices.service';

describe('DevicesService.update', () => {
    let devices: any, requests: any, members: any, svc: DevicesService;

    beforeEach(() => {
        devices = { update: jest.fn(), findOne: jest.fn().mockResolvedValue({ id: 'd1' }) };
        requests = {};
        members = { findOne: jest.fn() };
        svc = new DevicesService(devices, requests, members);
    });

    it('rechaza un miembro de otra sede', async () => {
        members.findOne.mockResolvedValue(null);
        await expect(svc.update('d1', 'p1', { teamMemberId: '6f1c0e0a-0000-4000-8000-000000000000' })).rejects.toBeInstanceOf(BadRequestException);
        expect(members.findOne).toHaveBeenCalledWith({ where: { id: '6f1c0e0a-0000-4000-8000-000000000000', placeId: 'p1' } });
        expect(devices.update).not.toHaveBeenCalled();
    });

    it('acepta miembro de la sede, meta y desasignar con null', async () => {
        members.findOne.mockResolvedValue({ id: 'm1' });
        await svc.update('d1', 'p1', { teamMemberId: 'm1', weeklyGoal: 20 } as any);
        expect(devices.update).toHaveBeenCalledWith({ id: 'd1', placeId: 'p1' }, { teamMemberId: 'm1', weeklyGoal: 20 });
        await svc.update('d1', 'p1', { teamMemberId: null, weeklyGoal: null } as any);
        expect(devices.update).toHaveBeenLastCalledWith({ id: 'd1', placeId: 'p1' }, { teamMemberId: null, weeklyGoal: null });
    });
});
