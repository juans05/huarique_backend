import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BusinessPlacesController, assertCategoryMatchesVertical } from './business-places.controller';
import { CreateOnboardingPlaceDto } from './dto/create-onboarding-place.dto';

const user = { id: 'u1', email: 'dueno@x.pe' };

const build = (overrides: Record<string, any> = {}) => {
    const placesRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn((x) => x),
        save: jest.fn(async (x) => ({ id: 'new-place', ...x })),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const categoryRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const teamMemberRepo = { find: jest.fn().mockResolvedValue([]) };
    const googleMapsService = { getPlaceDetails: jest.fn().mockResolvedValue({ name: 'Barber Kings', googlePlaceId: 'g1' }) };
    const mailService = { sendNewPlacePendingNotice: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn() };
    const ctrl: any = Object.create(BusinessPlacesController.prototype);
    Object.assign(ctrl, { placesRepo, categoryRepo, teamMemberRepo, googleMapsService, mailService, config, ...overrides });
    ctrl.logger = { error: jest.fn() };
    return { ctrl: ctrl as BusinessPlacesController, placesRepo, categoryRepo, teamMemberRepo, googleMapsService };
};

describe('CreateOnboardingPlaceDto', () => {
    const errorsFor = (businessType: unknown) =>
        validate(plainToInstance(CreateOnboardingPlaceDto, { name: 'Barber Kings', businessType }));

    it("rechaza un tipo desconocido ('xyz') y la ausencia del tipo", async () => {
        expect((await errorsFor('xyz')).map((e) => e.property)).toContain('businessType');
        expect((await errorsFor(undefined)).map((e) => e.property)).toContain('businessType');
    });

    it('acepta un tipo válido', async () => {
        expect(await errorsFor('barberia')).toHaveLength(0);
    });
});

describe('assertCategoryMatchesVertical', () => {
    it('sin categoría o con categoría sin rubro no restringe', () => {
        expect(() => assertCategoryMatchesVertical(null, 'barberia')).not.toThrow();
        expect(() => assertCategoryMatchesVertical({ vertical: null } as any, 'barberia')).not.toThrow();
    });

    it('rubro igual pasa, distinto lanza 400 con el mensaje del contrato', () => {
        expect(() => assertCategoryMatchesVertical({ vertical: 'belleza' } as any, 'barberia')).not.toThrow();
        expect(() => assertCategoryMatchesVertical({ vertical: 'gastronomia' } as any, 'barberia')).toThrow(
            new BadRequestException('La categoría no corresponde al rubro del negocio'),
        );
    });
});

describe('BusinessPlacesController.createPlace', () => {
    it('guarda el businessType elegido', async () => {
        const { ctrl, placesRepo } = build();
        const dto = { name: 'Barber Kings', address: 'Av. 1', businessType: 'barberia' };
        await ctrl.createPlace(dto as any, user);
        expect(placesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ businessType: 'barberia', claimedByUserId: 'u1' }));
    });
});

describe('BusinessPlacesController.claimPlace', () => {
    it('el tipo elegido por el dueño reemplaza al existente', async () => {
        const { ctrl, placesRepo } = build();
        await ctrl.claimPlace('p1', user, 'barberia');
        expect(placesRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'p1' }),
            { claimedByUserId: 'u1', status: 'pending', businessType: 'barberia' },
        );
    });

    it.each(['xyz', undefined, ''])('rechaza businessType %p con 400 sin tocar el local', async (bt) => {
        const { ctrl, placesRepo } = build();
        await expect(ctrl.claimPlace('p1', user, bt as any)).rejects.toBeInstanceOf(BadRequestException);
        expect(placesRepo.update).not.toHaveBeenCalled();
    });
});

describe('BusinessPlacesController.importPlace', () => {
    it('rechaza businessType inválido antes de consultar a Google', async () => {
        const { ctrl, googleMapsService } = build();
        await expect(ctrl.importPlace('g1', 'xyz', user)).rejects.toBeInstanceOf(BadRequestException);
        expect(googleMapsService.getPlaceDetails).not.toHaveBeenCalled();
    });

    it('un local nuevo se guarda con el businessType', async () => {
        const { ctrl, placesRepo } = build();
        await ctrl.importPlace('g1', 'peluqueria', user);
        expect(placesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ businessType: 'peluqueria', claimedByUserId: 'u1' }));
    });

    it('si ya existe en Wuarikes, lo reclama con el tipo elegido', async () => {
        const { ctrl, placesRepo } = build();
        placesRepo.findOne.mockResolvedValueOnce({ id: 'p9' });
        await ctrl.importPlace('g1', 'spa', user);
        expect(placesRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'p9' }),
            expect.objectContaining({ businessType: 'spa' }),
        );
    });
});

describe('BusinessPlacesController.getMyPlaces', () => {
    const owned = (businessType: string) => ({ id: 'p1', name: 'L', coverImageUrl: null, category: null, status: 'active', businessType });

    it('una barbería devuelve rubro belleza y los textos de Servicios', async () => {
        const { ctrl, placesRepo } = build();
        placesRepo.find.mockResolvedValue([owned('barberia')]);
        const [p] = await ctrl.getMyPlaces(user);
        expect(p.businessType).toBe('barberia');
        expect(p.vertical).toBe('belleza');
        expect(p.verticalConfig.labels.catalog).toBe('Servicios');
        expect(p.verticalConfig.modules).not.toContain('mesas');
    });

    it("un business_type desconocido ('heredado_raro') cae en gastronomía", async () => {
        const { ctrl, placesRepo } = build();
        placesRepo.find.mockResolvedValue([owned('heredado_raro')]);
        const [p] = await ctrl.getMyPlaces(user);
        expect(p.vertical).toBe('gastronomia');
        expect(p.verticalConfig.labels.catalog).toBe('Carta');
    });
});

describe('BusinessPlacesController.updateProfile (rubro y categoría)', () => {
    const setup = (place: any, category: any = null) => {
        const b = build();
        b.placesRepo.findOne.mockResolvedValue(place);
        b.categoryRepo.findOne.mockResolvedValue(category);
        return b;
    };
    const barberia = () => ({ id: 'p1', claimedByUserId: 'u1', businessType: 'barberia', categoryId: null });

    it('asignar una categoría de gastronomía a una barbería → 400 y no guarda', async () => {
        const { ctrl, placesRepo } = setup(barberia(), { id: 'c1', vertical: 'gastronomia' });
        await expect(ctrl.updateProfile('p1', { categoryId: 'c1' }, user)).rejects.toBeInstanceOf(BadRequestException);
        expect(placesRepo.save).not.toHaveBeenCalled();
    });

    it('una categoría del mismo rubro o sin rubro se acepta', async () => {
        for (const vertical of ['belleza', null]) {
            const { ctrl, placesRepo } = setup(barberia(), { id: 'c1', vertical });
            await ctrl.updateProfile('p1', { categoryId: 'c1' }, user);
            expect(placesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'c1' }));
        }
    });

    it('businessType inválido → 400', async () => {
        const { ctrl, placesRepo } = setup(barberia());
        await expect(ctrl.updateProfile('p1', { businessType: 'xyz' }, user)).rejects.toBeInstanceOf(BadRequestException);
        expect(placesRepo.save).not.toHaveBeenCalled();
    });

    it('cambiar de rubro con la categoría actual de otro rubro → 400', async () => {
        const place = { id: 'p1', claimedByUserId: 'u1', businessType: 'restaurante', categoryId: 'c1' };
        const { ctrl, placesRepo, categoryRepo } = setup(place, { id: 'c1', vertical: 'gastronomia' });
        await expect(ctrl.updateProfile('p1', { businessType: 'barberia' }, user)).rejects.toBeInstanceOf(BadRequestException);
        expect(categoryRepo.findOne).toHaveBeenCalledWith({ where: { id: 'c1' } });
        expect(placesRepo.save).not.toHaveBeenCalled();
    });

    it('cambiar de rubro quitando la categoría en la misma petición se guarda', async () => {
        const place = { id: 'p1', claimedByUserId: 'u1', businessType: 'restaurante', categoryId: 'c1' };
        const { ctrl, placesRepo } = setup(place, { id: 'c1', vertical: 'gastronomia' });
        await ctrl.updateProfile('p1', { businessType: 'barberia', categoryId: null }, user);
        expect(placesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ businessType: 'barberia', categoryId: null }));
    });

    it('un cambio de perfil sin rubro ni categoría no consulta categorías', async () => {
        const { ctrl, categoryRepo } = setup(barberia());
        await ctrl.updateProfile('p1', { name: 'Nuevo' }, user);
        expect(categoryRepo.findOne).not.toHaveBeenCalled();
    });
});
