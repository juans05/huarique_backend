import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IndependentOnboardingService } from './independent-onboarding.service';
import { CreateIndependentDto } from './dto/create-independent.dto';
import { Place } from './entities/place.entity';
import { Dish } from './entities/dish.entity';
import { Professional } from '../appointments/entities/professional.entity';

const IDS = new Map<unknown, string>([[Place, 'place-1'], [Professional, 'pro-1'], [Dish, 'dish-1']]);

const base: CreateIndependentDto = {
    displayName: 'Carlos',
    nickname: 'carlos.fade',
    serviceModes: ['local'],
    services: [{ name: 'Corte', price: 25, durationMin: 30 }],
};

const build = () => {
    const manager = {
        create: jest.fn((_entity: unknown, data: any) => data),
        save: jest.fn(async (entity: unknown, data: any) => ({ id: IDS.get(entity), ...data })),
    };
    const dataSource = { transaction: jest.fn((fn: (m: typeof manager) => unknown) => fn(manager)) };
    const placesRepo = { exists: jest.fn().mockResolvedValue(false) };
    const svc = new IndependentOnboardingService(dataSource as any, placesRepo as any);
    const saved = (entity: unknown) => manager.save.mock.calls.find(([e]) => e === entity)?.[1];
    return { svc, manager, placesRepo, saved };
};

describe('IndependentOnboardingService.create', () => {
    it('crea local barberia independiente, profesional vinculado y servicios', async () => {
        const { svc, saved } = build();
        const res = await svc.create('u1', {
            displayName: ' Carlos ', nickname: '@Carlos.Fade ', serviceModes: ['domicilio'], zone: 'SJM',
            services: [{ name: 'Corte', price: 25, durationMin: 30 }],
        });
        expect(saved(Place)).toMatchObject({
            name: 'Carlos', slug: 'carlos.fade', businessType: 'barberia', claimedByUserId: 'u1', status: 'pending', address: '',
            metadata: { independent: true, serviceModes: ['domicilio'], zone: 'SJM' },
        });
        expect(saved(Professional)).toMatchObject({
            placeId: res.placeId, name: 'Carlos', teamUserId: 'u1', active: true, serviceIds: [], daysOff: [], displayOrder: 0,
        });
        expect(saved(Dish)).toMatchObject({
            placeId: res.placeId, name: 'Corte', price: 25, durationMin: 30, kind: 'servicio', isAvailable: true, displayOrder: 0,
        });
        expect(res).toEqual({ placeId: 'place-1', professionalId: 'pro-1', nickname: 'carlos.fade' });
    });

    it('acepta el mismo nombre con distinto nickname (dos barberos "Carlos")', async () => {
        const { svc } = build();
        await expect(svc.create('u1', { ...base, nickname: 'carlos.fade' })).resolves.toMatchObject({ nickname: 'carlos.fade' });
        await expect(svc.create('u2', { ...base, nickname: 'carlos.sjm' })).resolves.toMatchObject({ nickname: 'carlos.sjm' });
    });

    it('nickname tomado → 409 "Ese nickname ya está en uso"', async () => {
        const { svc, manager } = build();
        manager.save.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
        await expect(svc.create('u1', base)).rejects.toThrow(ConflictException);
    });

    it('nickname con formato inválido → 400', async () => {
        const { svc } = build();
        await expect(svc.create('u1', { ...base, nickname: 'car los' })).rejects.toThrow(BadRequestException);
    });
});

describe('IndependentOnboardingService.checkNickname', () => {
    it('libre → available true sin sugerencias', async () => {
        const { svc } = build();
        await expect(svc.checkNickname('@Carlos.Fade')).resolves.toEqual({ nickname: 'carlos.fade', valid: true, available: true, suggestions: [] });
    });

    it('tomado → available false y 3 sugerencias libres', async () => {
        const { svc, placesRepo } = build();
        placesRepo.exists.mockImplementation(async ({ where }: any) => where.slug === 'carlos');
        const r = await svc.checkNickname('Carlos');
        expect(r).toMatchObject({ nickname: 'carlos', valid: true, available: false });
        expect(r.suggestions).toHaveLength(3);
        expect(r.suggestions).not.toContain('carlos');
    });

    it.each(['ab', '.carlos', 'carlos.', 'car los', 'carlos!', 'a'.repeat(31)])('inválido: %s', async (value) => {
        const { svc } = build();
        expect((await svc.checkNickname(value)).valid).toBe(false);
    });
});

describe('CreateIndependentDto', () => {
    const errorsFor = async (extra: Record<string, unknown>) =>
        (await validate(plainToInstance(CreateIndependentDto, { ...base, ...extra }))).map((e) => e.property);

    it('acepta una base válida', async () => {
        expect(await errorsFor({})).toEqual([]);
    });

    it.each([
        [{ services: [{ name: 'Corte', price: -1, durationMin: 30 }] }, 'services'],
        [{ services: [{ name: 'Corte', price: 25, durationMin: 0 }] }, 'services'],
        [{ services: [{ name: 'Corte', price: 25, durationMin: 481 }] }, 'services'],
        [{ services: [] }, 'services'],
        [{ serviceModes: [] }, 'serviceModes'],
        [{ serviceModes: ['avion'] }, 'serviceModes'],
        [{ displayName: 'C' }, 'displayName'],
        [{ nickname: '' }, 'nickname'],
    ])('rechaza %j', async (extra, prop) => {
        expect(await errorsFor(extra)).toContain(prop);
    });
});
