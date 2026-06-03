import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuCategory } from './entities/menu-category.entity';

@Injectable()
export class MenuFormatterService {
    constructor(
        @InjectRepository(MenuCategory)
        private categoryRepo: Repository<MenuCategory>,
    ) {}

    async formatMenuToMarkdown(placeId: string): Promise<string> {
        const categories = await this.categoryRepo.find({
            where: { placeId },
            relations: ['dishes'],
            order: { displayOrder: 'ASC', dishes: { displayOrder: 'ASC' } },
        });

        if (categories.length === 0) return '';

        const lines: string[] = ['## 📋 Carta Digital\n'];

        for (const cat of categories) {
            lines.push(`### ${cat.name}`);
            if (cat.description) lines.push(`*${cat.description}*`);
            lines.push('');

            if (cat.dishes?.length) {
                for (const dish of cat.dishes) {
                    const price = dish.price != null ? `S/ ${Number(dish.price).toFixed(2)}` : '';
                    const line = price ? `- **${dish.name}** — ${price}` : `- **${dish.name}**`;
                    lines.push(line);
                    if (dish.description) lines.push(`  > ${dish.description}`);
                }
            } else {
                lines.push('  *Sin platos registrados*');
            }
            lines.push('');
        }

        return lines.join('\n');
    }
}
