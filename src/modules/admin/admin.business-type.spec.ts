import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

const svcWith = (place: any) => {
    const placesRepository = { findOne: jest.fn().mockResolvedValue(place), update: jest.fn().mockResolvedValue(undefined) };
    const svc = Object.create(AdminService.prototype);
    Object.assign(svc, { placesRepository });
    return { svc: svc as AdminService, placesRepository };
};

describe('AdminService.setBusinessType', () => {
    it('fija el tipo de negocio del local', async () => {
        const { svc, placesRepository } = svcWith({ id: 'p1' });
        await svc.setBusinessType('p1', 'ferreteria');
        expect(placesRepository.update).toHaveBeenCalledWith('p1', { businessType: 'ferreteria' });
    });

    it('rechaza un tipo desconocido', async () => {
        const { svc, placesRepository } = svcWith({ id: 'p1' });
        await expect(svc.setBusinessType('p1', 'xyz')).rejects.toBeInstanceOf(BadRequestException);
        expect(placesRepository.update).not.toHaveBeenCalled();
    });

    it('local inexistente → 404', async () => {
        const { svc } = svcWith(null);
        await expect(svc.setBusinessType('p1', 'spa')).rejects.toBeInstanceOf(NotFoundException);
    });
});
