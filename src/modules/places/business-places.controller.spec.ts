import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BusinessPlacesController } from './business-places.controller';
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
    const subscriptionsService = { assertPlanAllowsBusinessType: jest.fn().mockResolvedValue(undefined) };
    const ctrl: any = Object.create(BusinessPlacesController.prototype);
    Object.assign(ctrl, { placesRepo, categoryRepo, teamMemberRepo, googleMapsService, mailService, config, subscriptionsService, ...overrides });
    ctrl.logger = { error: jest.fn() };
    return { ctrl: ctrl as BusinessPlacesController, placesRepo, categoryRepo, teamMemberRepo, googleMapsService };
};

describe('CreateOnboardingPlaceDto', () => {
    const errorsFor = (extra: Record<string, unknown>) =>
        validate(plainToInstance(CreateOnboardingPlaceDto, { name: 'Barber Kings', ...extra }));

    it("rechaza un tipo desconocido enviado explícitamente ('xyz', '')", async () => {
        expect((await errorsFor({ businessType: 'xyz' })).map((e) => e.property)).toContain('businessType');
        expect((await errorsFor({ businessType: '' })).map((e) => e.property)).toContain('businessType');
    });

    it('acepta un tipo válido o su ausencia (compatibilidad durante el despliegue)', async () => {
        expect(await errorsFor({ businessType: 'barberia' })).toHaveLength(0);
        expect(await errorsFor({})).toHaveLength(0);
    });
});

describe('BusinessPlacesController.getMyPlaces', () => {
    it('marca independent y nickname según metadata', async () => {
        const { ctrl, placesRepo } = build();
        placesRepo.find.mockResolvedValueOnce([
            { id: 'a', name: 'Carlos', slug: 'carlos.fade', businessType: 'barberia', metadata: { independent: true } },
            { id: 'b', name: 'Barber Kings', slug: 'barber-kings', businessType: 'barberia', metadata: null },
        ]);
        const res: any[] = await ctrl.getMyPlaces(user);
        expect(res.map((p) => p.independent)).toEqual([true, false]);
        expect(res.map((p) => p.nickname)).toEqual(['carlos.fade', null]);
    });
});

describe('BusinessPlacesController.createPlace', () => {
    it('guarda el businessType elegido', async () => {
        const { ctrl, placesRepo } = build();
        await ctrl.createPlace({ name: 'Barber Kings', address: 'Av. 1', businessType: 'barberia' }, user);
        expect(placesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ businessType: 'barberia', claimedByUserId: 'u1' }));
    });

    it("sin businessType se guarda como 'restaurante'", async () => {
        const { ctrl, placesRepo } = build();
        await ctrl.createPlace({ name: 'La Lucha', address: 'Av. 1' } as any, user);
        expect(placesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ businessType: 'restaurante' }));
    });
});

describe('BusinessPlacesController.claimPlace', () => {
    const unclaimed = (category: any = null) => ({ id: 'p1', claimedByUserId: null, businessType: 'restaurante', category });

    it('el tipo elegido por el dueño reemplaza al existente', async () => {
        const { ctrl, placesRepo } = build();
        placesRepo.findOne.mockResolvedValue(unclaimed());
        await ctrl.claimPlace('p1', user, 'barberia');
        expect(placesRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'p1' }),
            { claimedByUserId: 'u1', status: 'pending', businessType: 'barberia' },
        );
    });

    it('sin businessType conserva el tipo y la categoría que ya tenía el local', async () => {
        const { ctrl, placesRepo } = build();
        placesRepo.findOne.mockResolvedValue({ ...unclaimed({ id: 'c1', vertical: 'gastronomia' }), businessType: 'barberia' });
        await ctrl.claimPlace('p1', user, undefined as any);
        expect(placesRepo.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), { claimedByUserId: 'u1', status: 'pending' });
    });

    it.each(['xyz', ''])('rechaza businessType %p con 400 sin tocar el local', async (bt) => {
        const { ctrl, placesRepo } = build();
        placesRepo.findOne.mockResolvedValue(unclaimed());
        await expect(ctrl.claimPlace('p1', user, bt)).rejects.toBeInstanceOf(BadRequestException);
        expect(placesRepo.update).not.toHaveBeenCalled();
    });

    it('si cambia de rubro, quita la categoría que ya no corresponde', async () => {
        const { ctrl, placesRepo } = build();
        placesRepo.findOne.mockResolvedValue(unclaimed({ id: 'c1', vertical: 'gastronomia' }));
        await ctrl.claimPlace('p1', user, 'barberia');
        expect(placesRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'p1' }),
            expect.objectContaining({ businessType: 'barberia', categoryId: null }),
        );
    });

    it('conserva la categoría del mismo rubro o sin rubro', async () => {
        for (const vertical of ['gastronomia', null]) {
            const { ctrl, placesRepo } = build();
            placesRepo.findOne.mockResolvedValue(unclaimed({ id: 'c1', vertical }));
            await ctrl.claimPlace('p1', user, 'cafeteria');
            expect(placesRepo.update.mock.calls[0][1]).not.toHaveProperty('categoryId');
        }
    });

    it('local inexistente → 404; ya reclamado (o carrera perdida) → 400', async () => {
        const { ctrl, placesRepo } = build();
        await expect(ctrl.claimPlace('p1', user, 'spa')).rejects.toBeInstanceOf(NotFoundException);
        placesRepo.findOne.mockResolvedValue({ ...unclaimed(), claimedByUserId: 'otro' });
        await expect(ctrl.claimPlace('p1', user, 'spa')).rejects.toBeInstanceOf(BadRequestException);
        placesRepo.findOne.mockResolvedValue(unclaimed());
        placesRepo.update.mockResolvedValue({ affected: 0 });
        await expect(ctrl.claimPlace('p1', user, 'spa')).rejects.toBeInstanceOf(BadRequestException);
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

    it("sin businessType un local nuevo se guarda como 'restaurante'", async () => {
        const { ctrl, placesRepo } = build();
        await ctrl.importPlace('g1', undefined as any, user);
        expect(placesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ businessType: 'restaurante' }));
    });

    it('si ya existe en Wuarikes, lo reclama con el tipo elegido', async () => {
        const { ctrl, placesRepo } = build();
        const existing = { id: 'p9', claimedByUserId: null, category: null };
        placesRepo.findOne.mockResolvedValue(existing);
        await ctrl.importPlace('g1', 'spa', user);
        expect(placesRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'p9' }),
            expect.objectContaining({ businessType: 'spa' }),
        );
    });

    it('si ya existe y no llega businessType, conserva el tipo que tenía', async () => {
        const { ctrl, placesRepo } = build();
        placesRepo.findOne.mockResolvedValue({ id: 'p9', claimedByUserId: null, businessType: 'barberia', category: null });
        await ctrl.importPlace('g1', undefined as any, user);
        expect(placesRepo.update.mock.calls[0][1]).not.toHaveProperty('businessType');
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
    const barberia = (categoryId: string | null = null) => ({ id: 'p1', claimedByUserId: 'u1', businessType: 'barberia', categoryId });
    const restaurante = () => ({ id: 'p1', claimedByUserId: 'u1', businessType: 'restaurante', categoryId: 'c1' });
    const gastro = { id: 'c1', vertical: 'gastronomia' };

    it('asignar una categoría de gastronomía a una barbería → 400 y no guarda', async () => {
        const { ctrl, placesRepo } = setup(barberia(), gastro);
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

    it('una categoría que no existe → 400 "Categoría no encontrada"', async () => {
        const { ctrl, placesRepo } = setup(barberia(), null);
        await expect(ctrl.updateProfile('p1', { categoryId: 'nope' }, user)).rejects.toThrow(
            new BadRequestException('Categoría no encontrada'),
        );
        expect(placesRepo.save).not.toHaveBeenCalled();
    });

    it('businessType inválido → 400', async () => {
        const { ctrl, placesRepo } = setup(barberia());
        await expect(ctrl.updateProfile('p1', { businessType: 'xyz' }, user)).rejects.toBeInstanceOf(BadRequestException);
        expect(placesRepo.save).not.toHaveBeenCalled();
    });

    it('cambiar de rubro sin enviar categoryId quita la categoría que ya no corresponde (sin 400)', async () => {
        const { ctrl, placesRepo, categoryRepo } = setup(restaurante(), gastro);
        await ctrl.updateProfile('p1', { businessType: 'barberia' }, user);
        expect(categoryRepo.findOne).toHaveBeenCalledWith({ where: { id: 'c1' } });
        expect(placesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ businessType: 'barberia', categoryId: null }));
    });

    it('cambiar de tipo dentro del mismo rubro conserva la categoría', async () => {
        const { ctrl, placesRepo } = setup(restaurante(), gastro);
        await ctrl.updateProfile('p1', { businessType: 'cafeteria' }, user);
        expect(placesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ businessType: 'cafeteria', categoryId: 'c1' }));
    });

    it('cambiar de rubro con una categoría sin rubro la conserva', async () => {
        const { ctrl, placesRepo } = setup(restaurante(), { id: 'c1', vertical: null });
        await ctrl.updateProfile('p1', { businessType: 'barberia' }, user);
        expect(placesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ businessType: 'barberia', categoryId: 'c1' }));
    });

    it('cambiar de rubro enviando explícitamente una categoría que no corresponde → 400 (también si es la misma que ya tenía)', async () => {
        for (const categoryId of ['c1', 'c2']) {
            const { ctrl, placesRepo } = setup(restaurante(), { id: categoryId, vertical: 'gastronomia' });
            await expect(ctrl.updateProfile('p1', { businessType: 'barberia', categoryId }, user)).rejects.toBeInstanceOf(BadRequestException);
            expect(placesRepo.save).not.toHaveBeenCalled();
        }
    });

    it('cambiar de rubro quitando la categoría en la misma petición se guarda', async () => {
        const { ctrl, placesRepo } = setup(restaurante(), gastro);
        await ctrl.updateProfile('p1', { businessType: 'barberia', categoryId: null }, user);
        expect(placesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ businessType: 'barberia', categoryId: null }));
    });

    it('reenviar la misma categoría y el mismo tipo no valida ni consulta categorías', async () => {
        // local heredado con categoría de otro rubro: reenviar sin cambios no debe dar 400
        const { ctrl, placesRepo, categoryRepo } = setup(barberia('c1'), gastro);
        await ctrl.updateProfile('p1', { categoryId: 'c1', businessType: 'barberia', name: 'Nuevo' }, user);
        expect(categoryRepo.findOne).not.toHaveBeenCalled();
        expect(placesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'c1', name: 'Nuevo' }));
    });

    it('un cambio de perfil sin rubro ni categoría no consulta categorías', async () => {
        const { ctrl, categoryRepo } = setup(barberia('c1'));
        await ctrl.updateProfile('p1', { name: 'Nuevo' }, user);
        expect(categoryRepo.findOne).not.toHaveBeenCalled();
    });
});

describe('BusinessPlacesController "Tu día"', () => {
    const setup = (assertAccess: jest.Mock) => {
        const placeTeamService = { assertAccess };
        const todayService = { getToday: jest.fn().mockResolvedValue({ ok: 1 }), getReviewsToday: jest.fn().mockResolvedValue({ connected: true, unanswered: 2 }) };
        const { ctrl } = build({ placeTeamService, todayService });
        return { ctrl, placeTeamService, todayService };
    };

    it('valida acceso (dueño o equipo) y devuelve los datos de /today y /today/reviews', async () => {
        const { ctrl, placeTeamService, todayService } = setup(jest.fn().mockResolvedValue({ role: 'agente' }));
        expect(await ctrl.getToday('p1', user)).toEqual({ ok: 1 });
        expect(await ctrl.getTodayReviews('p1', user)).toEqual({ connected: true, unanswered: 2 });
        expect(placeTeamService.assertAccess).toHaveBeenCalledWith('u1', 'p1');
        expect(todayService.getToday).toHaveBeenCalledWith('p1');
        expect(todayService.getReviewsToday).toHaveBeenCalledWith('p1');
    });

    it('sin acceso no lee nada', async () => {
        const { ctrl, todayService } = setup(jest.fn().mockRejectedValue(new ForbiddenException()));
        await expect(ctrl.getToday('p1', user)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(ctrl.getTodayReviews('p1', user)).rejects.toBeInstanceOf(ForbiddenException);
        expect(todayService.getToday).not.toHaveBeenCalled();
        expect(todayService.getReviewsToday).not.toHaveBeenCalled();
    });
});
