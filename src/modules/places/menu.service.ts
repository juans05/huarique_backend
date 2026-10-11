import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuCategory } from './entities/menu-category.entity';
import { Dish } from './entities/dish.entity';
import { ImportedCategory } from './menu-import.util';

export interface CreateCategoryDto {
    name: string;
    description?: string;
    displayOrder?: number;
    categoryType?: 'food' | 'drink' | 'dessert' | 'other';
}

export interface UpdateCategoryDto {
    name?: string;
    description?: string;
    displayOrder?: number;
    categoryType?: 'food' | 'drink' | 'dessert' | 'other';
}

export interface CreateDishDto {
    name: string;
    price?: number;
    description?: string;
    imageUrl?: string;
    images?: string[];
    videoUrl?: string;
    isVegetarian?: boolean;
    allergens?: string[];
    ingredients?: string[];
    isAvailable?: boolean;
    categoryId?: string;
    displayOrder?: number;
}

export interface UpdateDishDto {
    name?: string;
    price?: number;
    description?: string;
    imageUrl?: string;
    images?: string[];
    videoUrl?: string;
    isVegetarian?: boolean;
    allergens?: string[];
    ingredients?: string[];
    isAvailable?: boolean;
    categoryId?: string;
    displayOrder?: number;
}

@Injectable()
export class MenuService {
    constructor(
        @InjectRepository(MenuCategory)
        private categoryRepo: Repository<MenuCategory>,
        @InjectRepository(Dish)
        private dishRepo: Repository<Dish>,
    ) {}

    /** images es la fuente de verdad; imageUrl (portada) se deriva para los clientes que aún lo leen. */
    private coverFields(dto: { imageUrl?: string; images?: string[] }) {
        const images = dto.images ?? (dto.imageUrl ? [dto.imageUrl] : []);
        return { images, imageUrl: images[0] ?? null };
    }

    async createCategory(placeId: string, dto: CreateCategoryDto): Promise<MenuCategory> {
        const count = await this.categoryRepo.count({ where: { placeId } });
        const category = this.categoryRepo.create({
            name: dto.name,
            description: dto.description,
            placeId,
            displayOrder: dto.displayOrder ?? count,
            categoryType: dto.categoryType || 'food',
        });
        return this.categoryRepo.save(category);
    }

    /** Guarda en bloque lo importado (IA/plantilla). Reutiliza categorías existentes con el mismo nombre en vez de duplicarlas. */
    async importMenu(placeId: string, categories: ImportedCategory[]): Promise<{ categories: number; dishes: number }> {
        const existing = await this.categoryRepo.find({ where: { placeId } });
        const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));
        let dishes = 0;

        for (const cat of categories) {
            const key = cat.name.toLowerCase();
            const category =
                byName.get(key) ?? (await this.createCategory(placeId, { name: cat.name, categoryType: cat.categoryType }));
            byName.set(key, category);

            const start = await this.dishRepo.count({ where: { placeId, categoryId: category.id } });
            for (const [i, d] of cat.dishes.entries()) {
                await this.createDish(placeId, {
                    name: d.name,
                    description: d.description,
                    price: d.price ?? undefined,
                    categoryId: category.id,
                    displayOrder: start + i,
                });
                dishes++;
            }
        }
        return { categories: categories.length, dishes };
    }

    async getMenu(placeId: string): Promise<MenuCategory[]> {
        return this.categoryRepo.find({
            where: { placeId },
            relations: ['dishes'],
            order: { displayOrder: 'ASC', dishes: { displayOrder: 'ASC' } },
        });
    }

    // Siempre se busca por id Y placeId: así nadie toca la carta de otro local cambiando el id en la URL.
    async updateCategory(placeId: string, categoryId: string, dto: UpdateCategoryDto): Promise<MenuCategory> {
        const category = await this.categoryRepo.findOne({ where: { id: categoryId, placeId } });
        if (!category) throw new NotFoundException(`Categoría ${categoryId} no encontrada`);
        // Campos uno por uno: un `id` o `placeId` en el body no debe llegar a la base.
        if (dto.name !== undefined) category.name = dto.name;
        if (dto.description !== undefined) category.description = dto.description;
        if (dto.displayOrder !== undefined) category.displayOrder = dto.displayOrder;
        if (dto.categoryType !== undefined) category.categoryType = dto.categoryType;
        return this.categoryRepo.save(category);
    }

    async deleteCategory(placeId: string, categoryId: string): Promise<void> {
        const category = await this.categoryRepo.findOne({
            where: { id: categoryId, placeId },
            relations: ['dishes'],
        });
        if (!category) throw new NotFoundException(`Categoría ${categoryId} no encontrada`);
        await this.categoryRepo.remove(category);
    }

    async createDish(placeId: string, dto: CreateDishDto): Promise<Dish> {
        await this.assertCategoryOfPlace(placeId, dto.categoryId);
        const dish = this.dishRepo.create({
            name: dto.name,
            price: dto.price,
            description: dto.description,
            ...this.coverFields(dto),
            videoUrl: dto.videoUrl,
            isVegetarian: dto.isVegetarian ?? false,
            allergens: dto.allergens,
            ingredients: dto.ingredients,
            isAvailable: dto.isAvailable ?? true,
            categoryId: dto.categoryId,
            placeId,
            displayOrder: dto.displayOrder ?? 0,
        });
        return this.dishRepo.save(dish);
    }

    async updateDish(placeId: string, dishId: string, dto: UpdateDishDto): Promise<Dish> {
        const dish = await this.dishRepo.findOne({ where: { id: dishId, placeId } });
        if (!dish) throw new NotFoundException(`Plato ${dishId} no encontrado`);
        await this.assertCategoryOfPlace(placeId, dto.categoryId);

        if (dto.name !== undefined) dish.name = dto.name;
        if (dto.price !== undefined) dish.price = dto.price;
        if (dto.description !== undefined) dish.description = dto.description;
        if (dto.images !== undefined || dto.imageUrl !== undefined) Object.assign(dish, this.coverFields(dto));
        if (dto.videoUrl !== undefined) dish.videoUrl = dto.videoUrl;
        if (dto.isVegetarian !== undefined) dish.isVegetarian = dto.isVegetarian;
        if (dto.allergens !== undefined) dish.allergens = dto.allergens;
        if (dto.ingredients !== undefined) dish.ingredients = dto.ingredients;
        if (dto.isAvailable !== undefined) dish.isAvailable = dto.isAvailable;
        if (dto.categoryId !== undefined) dish.categoryId = dto.categoryId;
        if (dto.displayOrder !== undefined) dish.displayOrder = dto.displayOrder;

        return this.dishRepo.save(dish);
    }

    async deleteDish(placeId: string, dishId: string): Promise<void> {
        const dish = await this.dishRepo.findOne({ where: { id: dishId, placeId } });
        if (!dish) throw new NotFoundException(`Plato ${dishId} no encontrado`);
        await this.dishRepo.remove(dish);
    }

    // Un plato no puede colgar de la categoría de otro local.
    private async assertCategoryOfPlace(placeId: string, categoryId: string | undefined): Promise<void> {
        if (!categoryId) return;
        const exists = await this.categoryRepo.count({ where: { id: categoryId, placeId } });
        if (!exists) throw new NotFoundException(`Categoría ${categoryId} no encontrada`);
    }
}
