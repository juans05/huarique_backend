import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuCategory } from './entities/menu-category.entity';
import { DEFAULT_BUSINESS_TYPE, getVerticalConfig } from './business-types';

@Injectable()
export class MenuFormatterService {
    constructor(
        @InjectRepository(MenuCategory)
        private categoryRepo: Repository<MenuCategory>,
    ) {}

    /** Catálogo del local en markdown para el bot. Gastronomía conserva la "Carta Digital" de siempre. */
    async formatMenuToMarkdown(placeId: string, businessType: string = DEFAULT_BUSINESS_TYPE): Promise<string> {
        const categories = await this.categoryRepo.find({
            where: { placeId },
            relations: ['dishes'],
            order: { displayOrder: 'ASC', dishes: { displayOrder: 'ASC' } },
        });

        if (categories.length === 0) return '';

        const { vertical, labels } = getVerticalConfig(businessType);
        const gastronomia = vertical === 'gastronomia';
        const lines: string[] = [`## 📋 ${gastronomia ? 'Carta Digital' : labels.catalog}\n`];

        for (const cat of categories) {
            lines.push(`### ${cat.name}`);
            if (cat.description) lines.push(`*${cat.description}*`);
            lines.push('');

            if (cat.dishes?.length) {
                for (const dish of cat.dishes) {
                    const price = dish.price != null ? `S/ ${Number(dish.price).toFixed(2)}` : '';
                    const duration = dish.kind === 'servicio' && dish.durationMin ? ` · ${dish.durationMin} min` : '';
                    lines.push(`- **${dish.name}**${price ? ` — ${price}` : ''}${duration}`);
                    if (dish.description) lines.push(`  > ${dish.description}`);
                }
            } else {
                lines.push(gastronomia ? '  *Sin platos registrados*' : '  *Sin ítems registrados*');
            }
            lines.push('');
        }

        return lines.join('\n');
    }
}
