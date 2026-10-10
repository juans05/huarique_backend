import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

const svcWith = (place: any, user: any) => {
    const placesRepository = { findOne: jest.fn().mockResolvedValue(place), update: jest.fn().mockResolvedValue(undefined) };
    const usersRepository = { findOne: jest.fn().mockResolvedValue(user) };
    const svc = Object.create(AdminService.prototype);
    Object.assign(svc, { placesRepository, usersRepository });
    return { svc: svc as AdminService, placesRepository };
};

describe('AdminService.assignSalesUser', () => {
    it('asigna un comercial con fecha', async () => {
        const { svc, placesRepository } = svcWith({ id: 'p1' }, { id: 'u1', role: 'sales' });
        await svc.assignSalesUser('p1', 'u1');
        expect(placesRepository.update).toHaveBeenCalledWith('p1', { assignedSalesUserId: 'u1', salesAssignedAt: expect.any(Date) });
    });

    it('null deja el local libre', async () => {
        const { svc, placesRepository } = svcWith({ id: 'p1' }, null);
        await svc.assignSalesUser('p1', null);
        expect(placesRepository.update).toHaveBeenCalledWith('p1', { assignedSalesUserId: null, salesAssignedAt: null });
    });

    it('rechaza un usuario que no es comercial', async () => {
        const { svc, placesRepository } = svcWith({ id: 'p1' }, { id: 'u1', role: 'business' });
        await expect(svc.assignSalesUser('p1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
        expect(placesRepository.update).not.toHaveBeenCalled();
    });

    it('local inexistente → 404', async () => {
        const { svc } = svcWith(null, { id: 'u1', role: 'sales' });
        await expect(svc.assignSalesUser('p1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
});
