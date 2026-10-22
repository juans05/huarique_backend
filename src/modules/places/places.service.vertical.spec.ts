import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { PlaceResponseDto } from './dto/place-response.dto';
import { typesOfVertical } from './business-types';

// Query builder falso: todo método encadenable devuelve el mismo objeto.
const fakeQb = () => {
    const qb: any = {};
    for (const m of ['leftJoinAndSelect', 'leftJoin', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy', 'orderBy', 'addOrderBy', 'limit', 'skip', 'take']) {
        qb[m] = jest.fn().mockReturnValue(qb);
    }
    qb.getCount = jest.fn().mockResolvedValue(0);
    qb.getRawAndEntities = jest.fn().mockResolvedValue({ entities: [], raw: [] });
    qb.getMany = jest.fn().mockResolvedValue([]);
    return qb;
};

const build = () => {
    const qb = fakeQb();
    const placesRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const categoriesRepo = { find: jest.fn().mockResolvedValue([]) };
    // Las otras 11 dependencias del constructor no se usan en estos métodos.
    const service = new PlacesService(placesRepo as any, categoriesRepo as any, ...(Array(11).fill({}) as [any, any, any, any, any, any, any, any, any, any, any]));
    return { service, qb, categoriesRepo };
};

const vtypesCall = (qb: any) => qb.andWhere.mock.calls.find(([sql]: [string]) => sql === 'place.business_type IN (:...vtypes)');
const page = (extra: object = {}) => ({ page: 1, limitOrSize: 10, ...extra }) as any;

describe('filtro por rubro en la API pública de lugares', () => {
    describe.each([
        ['findAll', (s: PlacesService, v?: string) => s.findAll(page({ vertical: v }))],
        ['getRecommendations', (s: PlacesService, v?: string) => s.getRecommendations(page({ vertical: v }))],
        ['getDiscovery', (s: PlacesService, v?: string) => s.getDiscovery(undefined, undefined, 10, v)],
        ['getMostFavorited', (s: PlacesService, v?: string) => s.getMostFavorited(10, v)],
    ])('%s', (_name, call) => {
        it('sin rubro devuelve solo gastronomía', async () => {
            const { service, qb } = build();
            await call(service);
            expect(vtypesCall(qb)[1]).toEqual({ vtypes: typesOfVertical('gastronomia') });
        });

        it("con 'belleza' filtra por sus tipos", async () => {
            const { service, qb } = build();
            await call(service, 'belleza');
            expect(vtypesCall(qb)[1]).toEqual({ vtypes: ['barberia', 'peluqueria', 'spa'] });
        });

        it("con 'all' no filtra por tipo de negocio", async () => {
            const { service, qb } = build();
            await call(service, 'all');
            expect(vtypesCall(qb)).toBeUndefined();
        });

        it('un rubro inválido lanza 400', async () => {
            const { service } = build();
            await expect(call(service, 'xyz')).rejects.toThrow(BadRequestException);
        });
    });

    it('la búsqueda por texto también queda en gastronomía por defecto (pasa por findAll)', async () => {
        const { service, qb } = build();
        await service.findAll(page({ search: 'ceviche' }));
        expect(vtypesCall(qb)[1]).toEqual({ vtypes: typesOfVertical('gastronomia') });
    });

    describe('getCategories', () => {
        it('sin rubro devuelve las de gastronomía', async () => {
            const { service, categoriesRepo } = build();
            await service.getCategories();
            expect(categoriesRepo.find).toHaveBeenCalledWith({ where: { vertical: 'gastronomia' }, order: { name: 'ASC' } });
        });

        it("con 'salud' filtra por ese rubro y con 'all' no filtra", async () => {
            const { service, categoriesRepo } = build();
            await service.getCategories('salud');
            expect(categoriesRepo.find).toHaveBeenLastCalledWith({ where: { vertical: 'salud' }, order: { name: 'ASC' } });
            await service.getCategories('all');
            expect(categoriesRepo.find).toHaveBeenLastCalledWith({ order: { name: 'ASC' } });
        });

        it('un rubro inválido lanza 400 sin consultar', async () => {
            const { service, categoriesRepo } = build();
            await expect(service.getCategories('xyz')).rejects.toThrow(BadRequestException);
            expect(categoriesRepo.find).not.toHaveBeenCalled();
        });
    });

    it('PlaceResponseDto expone businessType', () => {
        const dto = plainToInstance(PlaceResponseDto, { id: 'p1', name: 'Corte', businessType: 'barberia', secreto: 'x' }, { excludeExtraneousValues: true });
        expect(dto.businessType).toBe('barberia');
        expect((dto as any).secreto).toBeUndefined();
    });

    it('el controlador pasa vertical a categories, discovery/different y discovery/most-favorited', async () => {
        const svc = { getCategories: jest.fn(), getDiscovery: jest.fn(), getMostFavorited: jest.fn() };
        const ctrl = new PlacesController(svc as any, {} as any, {} as any, {} as any, {} as any, {} as any);
        await ctrl.getCategories('belleza');
        await ctrl.getDiscovery('Miraflores', 'cafe', 5, 'belleza');
        await ctrl.getMostFavorited(7, 'all');
        expect(svc.getCategories).toHaveBeenCalledWith('belleza');
        expect(svc.getDiscovery).toHaveBeenCalledWith('Miraflores', 'cafe', 5, 'belleza');
        expect(svc.getMostFavorited).toHaveBeenCalledWith(7, 'all');
    });
});
