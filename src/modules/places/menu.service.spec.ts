import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { MenuService } from './menu.service';
import { MenuCategory } from './entities/menu-category.entity';
import { Dish } from './entities/dish.entity';

const mockCategoryRepo = () => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
});

const mockDishRepo = () => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
});

describe('MenuService', () => {
    let service: MenuService;
    let categoryRepo: ReturnType<typeof mockCategoryRepo>;
    let dishRepo: ReturnType<typeof mockDishRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MenuService,
                { provide: getRepositoryToken(MenuCategory), useFactory: mockCategoryRepo },
                { provide: getRepositoryToken(Dish), useFactory: mockDishRepo },
            ],
        }).compile();

        service = module.get<MenuService>(MenuService);
        categoryRepo = module.get(getRepositoryToken(MenuCategory));
        dishRepo = module.get(getRepositoryToken(Dish));
    });

    // ── createCategory ───────────────────────────────────────────────────────

    describe('createCategory', () => {
        it('saves a category with name and placeId', async () => {
            const placeId = 'place-1';
            const dto = { name: 'Entradas', description: 'Platos de entrada' };
            const built = { ...dto, placeId, displayOrder: 0 };
            const saved = { id: 'cat-1', ...built };

            categoryRepo.count.mockResolvedValue(0);
            categoryRepo.create.mockReturnValue(built);
            categoryRepo.save.mockResolvedValue(saved);

            const result = await service.createCategory(placeId, dto);

            expect(categoryRepo.create).toHaveBeenCalledWith({
                name: dto.name,
                description: dto.description,
                placeId,
                displayOrder: 0,
            });
            expect(categoryRepo.save).toHaveBeenCalledWith(built);
            expect(result).toEqual(saved);
        });

        it('assigns displayOrder as next position when categories already exist', async () => {
            categoryRepo.count.mockResolvedValue(3);
            categoryRepo.create.mockReturnValue({});
            categoryRepo.save.mockResolvedValue({ id: 'cat-2' });

            await service.createCategory('place-1', { name: 'Postres' });

            expect(categoryRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ displayOrder: 3 }),
            );
        });
    });

    // ── getMenu ──────────────────────────────────────────────────────────────

    describe('getMenu', () => {
        it('returns categories with dishes sorted by displayOrder', async () => {
            const categories = [
                { id: 'cat-1', name: 'Entradas', displayOrder: 0, dishes: [] },
                { id: 'cat-2', name: 'Fondos', displayOrder: 1, dishes: [] },
            ];
            categoryRepo.find.mockResolvedValue(categories);

            const result = await service.getMenu('place-1');

            expect(categoryRepo.find).toHaveBeenCalledWith({
                where: { placeId: 'place-1' },
                relations: ['dishes'],
                order: { displayOrder: 'ASC', dishes: { displayOrder: 'ASC' } },
            });
            expect(result).toEqual(categories);
        });

        it('returns empty array when place has no categories', async () => {
            categoryRepo.find.mockResolvedValue([]);

            const result = await service.getMenu('place-empty');

            expect(result).toEqual([]);
        });
    });

    // ── updateCategory ───────────────────────────────────────────────────────

    describe('updateCategory', () => {
        it('updates name and description of an existing category', async () => {
            const existing = { id: 'cat-1', name: 'Entradas', description: null, placeId: 'p1', displayOrder: 0 };
            const dto = { name: 'Entradas Frías', description: 'Ceviches y tiraditos' };
            const updated = { ...existing, ...dto };

            categoryRepo.findOne.mockResolvedValue(existing);
            categoryRepo.save.mockResolvedValue(updated);

            const result = await service.updateCategory('cat-1', dto);

            expect(categoryRepo.save).toHaveBeenCalledWith({ ...existing, ...dto });
            expect(result.name).toBe('Entradas Frías');
        });

        it('throws NotFoundException when category does not exist', async () => {
            categoryRepo.findOne.mockResolvedValue(null);

            await expect(service.updateCategory('non-existent', { name: 'X' }))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ── deleteCategory ───────────────────────────────────────────────────────

    describe('deleteCategory', () => {
        it('removes an existing category', async () => {
            const category = { id: 'cat-1', name: 'Entradas', dishes: [] };
            categoryRepo.findOne.mockResolvedValue(category);

            await service.deleteCategory('cat-1');

            expect(categoryRepo.remove).toHaveBeenCalledWith(category);
        });

        it('throws NotFoundException when category does not exist', async () => {
            categoryRepo.findOne.mockResolvedValue(null);

            await expect(service.deleteCategory('non-existent'))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ── createDish ───────────────────────────────────────────────────────────

    describe('createDish', () => {
        it('saves a dish with name, price, placeId and categoryId', async () => {
            const placeId = 'place-1';
            const dto = { name: 'Ceviche Clásico', price: 32.5, categoryId: 'cat-1' };
            const built = { ...dto, placeId, displayOrder: 0 };
            const saved = { id: 'dish-1', ...built };

            dishRepo.create.mockReturnValue(built);
            dishRepo.save.mockResolvedValue(saved);

            const result = await service.createDish(placeId, dto);

            expect(dishRepo.create).toHaveBeenCalledWith({
                name: dto.name,
                price: dto.price,
                categoryId: dto.categoryId,
                placeId,
                description: undefined,
                imageUrl: undefined,
                displayOrder: 0,
            });
            expect(dishRepo.save).toHaveBeenCalledWith(built);
            expect(result).toEqual(saved);
        });

        it('saves a dish without category (uncategorized)', async () => {
            const dto = { name: 'Agua Mineral', price: 5 };
            dishRepo.create.mockReturnValue({});
            dishRepo.save.mockResolvedValue({ id: 'dish-2' });

            await service.createDish('place-1', dto);

            expect(dishRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ categoryId: undefined }),
            );
        });
    });

    // ── updateDish ───────────────────────────────────────────────────────────

    describe('updateDish', () => {
        it('updates dish fields', async () => {
            const existing = { id: 'dish-1', name: 'Ceviche', price: 30, placeId: 'p1', categoryId: 'cat-1' };
            const dto = { name: 'Ceviche Clásico', price: 35 };
            const updated = { ...existing, ...dto };

            dishRepo.findOne.mockResolvedValue(existing);
            dishRepo.save.mockResolvedValue(updated);

            const result = await service.updateDish('dish-1', dto);

            expect(dishRepo.save).toHaveBeenCalledWith({ ...existing, ...dto });
            expect(result.price).toBe(35);
        });

        it('throws NotFoundException when dish does not exist', async () => {
            dishRepo.findOne.mockResolvedValue(null);

            await expect(service.updateDish('non-existent', { name: 'X' }))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ── deleteDish ───────────────────────────────────────────────────────────

    describe('deleteDish', () => {
        it('removes an existing dish', async () => {
            const dish = { id: 'dish-1', name: 'Ceviche' };
            dishRepo.findOne.mockResolvedValue(dish);

            await service.deleteDish('dish-1');

            expect(dishRepo.remove).toHaveBeenCalledWith(dish);
        });

        it('throws NotFoundException when dish does not exist', async () => {
            dishRepo.findOne.mockResolvedValue(null);

            await expect(service.deleteDish('non-existent'))
                .rejects.toThrow(NotFoundException);
        });
    });
});
