import { BadRequestException } from '@nestjs/common';
import { BusinessPlacesController } from './business-places.controller';

describe('Reclamo de local en el onboarding', () => {
    const docs = {
        fichaRuc: 'https://res.cloudinary.com/x/raw/upload/ruc.pdf',
        dni: 'https://res.cloudinary.com/x/image/upload/dni.jpg',
        manifiesto: 'https://res.cloudinary.com/x/raw/upload/manifiesto.pdf',
    };
    let place: any;
    let ctrl: any;

    beforeEach(() => {
        place = { id: 'p1', name: 'La Esquina', claimedByUserId: null };
        ctrl = Object.create(BusinessPlacesController.prototype);
        ctrl.placesRepo = { findOne: jest.fn(async () => place), update: jest.fn(), save: jest.fn() };
        ctrl.placesService = { claimPlace: jest.fn(async () => ({ id: 'c1' })) };
        ctrl.notifyPendingPlace = jest.fn();
    });

    it('sin los tres documentos no crea nada', async () => {
        await expect(ctrl.claimPlace('p1', { id: 'u1' }, { businessType: 'restaurante', documents: { fichaRuc: docs.fichaRuc } }))
            .rejects.toThrow(BadRequestException);
        await expect(ctrl.claimPlace('p1', { id: 'u1' }, { documents: { ...docs, dni: 'https://evil.example/dni.jpg' } }))
            .rejects.toThrow(BadRequestException);
        expect(ctrl.placesService.claimPlace).not.toHaveBeenCalled();
    });

    it('con documentos crea una solicitud pendiente y no asigna el local', async () => {
        const res = await ctrl.claimPlace('p1', { id: 'u1', email: 'a@b.pe' }, { businessType: 'restaurante', documents: docs });
        expect(res.status).toBe('pending');
        expect(ctrl.placesService.claimPlace).toHaveBeenCalledWith('u1', 'p1',
            expect.objectContaining({ documentUrls: [docs.fichaRuc, docs.dni, docs.manifiesto] }), 'restaurante');
        expect(ctrl.placesRepo.update).not.toHaveBeenCalled();
        expect(ctrl.placesRepo.save).not.toHaveBeenCalled();
    });

    it('un local con dueño no se puede reclamar', async () => {
        place.claimedByUserId = 'otro';
        await expect(ctrl.claimPlace('p1', { id: 'u1' }, { documents: docs })).rejects.toThrow('ya ha sido reclamado');
    });
});
