import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuCategory } from './entities/menu-category.entity';
import { Dish } from './entities/dish.entity';

export interface CreateCategoryDto {
    name: string;
    description?: string;
    displayOrder?: number;
}

export interface UpdateCategoryDto {
    name?: string;
    description?: string;
    displayOrder?: number;
}

export interface CreateDishDto {
    name: string;
    price?: number;
    description?: string;
    imageUrl?: string;
    categoryId?: string;
    displayOrder?: number;
}

export interface UpdateDishDto {
    name?: string;
    price?: number;
    description?: string;
    imageUrl?: string;
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

    async createCategory(placeId: string, dto: CreateCategoryDto): Promise<MenuCategory> {
        const count = await this.categoryRepo.count({ where: { placeId } });
        const category = this.categoryRepo.create({
            name: dto.name,
            description: dto.description,
            placeId,
            displayOrder: dto.displayOrder ?? count,
        });
        return this.categoryRepo.save(category);
    }

    async getMenu(placeId: string): Promise<MenuCategory[]> {
        return this.categoryRepo.find({
            where: { placeId },
            relations: ['dishes'],
            order: { displayOrder: 'ASC', dishes: { displayOrder: 'ASC' } },
        });
    }

    async updateCategory(categoryId: string, dto: UpdateCategoryDto): Promise<MenuCategory> {
        const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
        if (!category) throw new NotFoundException(`Categoría ${categoryId} no encontrada`);
        return this.categoryRepo.save({ ...category, ...dto });
    }

    async deleteCategory(categoryId: string): Promise<void> {
        const category = await this.categoryRepo.findOne({
            where: { id: categoryId },
            relations: ['dishes'],
        });
        if (!category) throw new NotFoundException(`Categoría ${categoryId} no encontrada`);
        await this.categoryRepo.remove(category);
    }

    async createDish(placeId: string, dto: CreateDishDto): Promise<Dish> {
        const dish = this.dishRepo.create({
            name: dto.name,
            price: dto.price,
            description: dto.description,
            imageUrl: dto.imageUrl,
            categoryId: dto.categoryId,
            placeId,
            displayOrder: dto.displayOrder ?? 0,
        });
        return this.dishRepo.save(dish);
    }

    async updateDish(dishId: string, dto: UpdateDishDto): Promise<Dish> {
        const dish = await this.dishRepo.findOne({ where: { id: dishId } });
        if (!dish) throw new NotFoundException(`Plato ${dishId} no encontrado`);
        return this.dishRepo.save({ ...dish, ...dto });
    }

    async deleteDish(dishId: string): Promise<void> {
        const dish = await this.dishRepo.findOne({ where: { id: dishId } });
        if (!dish) throw new NotFoundException(`Plato ${dishId} no encontrado`);
        await this.dishRepo.remove(dish);
    }
}
