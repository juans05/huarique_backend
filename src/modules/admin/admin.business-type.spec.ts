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

    it('si cambia de rubro, quita la categoría que ya no corresponde', async () => {
        const { svc, placesRepository } = svcWith({ id: 'p1', category: { id: 'c1', vertical: 'gastronomia' } });
        await svc.setBusinessType('p1', 'barberia');
        expect(placesRepository.update).toHaveBeenCalledWith('p1', { businessType: 'barberia', categoryId: null });
    });

    it('conserva la categoría del mismo rubro o sin rubro', async () => {
        for (const vertical of ['gastronomia', null]) {
            const { svc, placesRepository } = svcWith({ id: 'p1', category: { id: 'c1', vertical } });
            await svc.setBusinessType('p1', 'cafeteria');
            expect(placesRepository.update).toHaveBeenCalledWith('p1', { businessType: 'cafeteria' });
        }
    });
});
