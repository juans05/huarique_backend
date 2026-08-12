import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotMenuOption } from './entities/bot-menu-option.entity';

@Injectable()
export class BotMenuOptionService {
  constructor(
    @InjectRepository(BotMenuOption)
    private repo: Repository<BotMenuOption>,
  ) {}

  findByPlaceId(placeId: string) {
    return this.repo.find({ where: { placeId }, order: { displayOrder: 'ASC' } });
  }

  // La lista completa se edita como un bloque desde el admin panel — más simple
  // que trackear altas/bajas/reordenamientos individuales por id.
  async replaceAll(
    placeId: string,
    options: { label: string; actionType: 'file' | 'text' | 'human'; actionValue?: string | null }[],
  ) {
    await this.repo.delete({ placeId });
    if (options.length === 0) return [];
    const rows = options.map((opt, i) =>
      this.repo.create({
        placeId,
        displayOrder: i + 1,
        label: opt.label,
        actionType: opt.actionType,
        actionValue: opt.actionValue || null,
      }),
    );
    return this.repo.save(rows);
  }
}
