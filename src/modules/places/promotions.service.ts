import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Promotion } from './entities/promotion.entity';
import { Place } from './entities/place.entity';

export interface CreatePromotionDto {
    title: string;
    description?: string;
    imageUrl?: string;
    startsAt?: Date;
    endsAt?: Date;
    discountType?: 'percentage' | 'fixed_amount';
    discountValue?: number;
}

@Injectable()
export class PromotionsService {
    constructor(
        @InjectRepository(Promotion)
        private promotionsRepo: Repository<Promotion>,
        @InjectRepository(Place)
        private placesRepo: Repository<Place>,
    ) {}

    async getActiveForPlace(placeId: string): Promise<Promotion[]> {
        return this.promotionsRepo
            .createQueryBuilder('promotion')
            .where('promotion.place_id = :placeId', { placeId })
            .andWhere('promotion.is_active = true')
            .andWhere('(promotion.starts_at IS NULL OR promotion.starts_at <= now())')
            .andWhere('(promotion.ends_at IS NULL OR promotion.ends_at >= now())')
            .orderBy('promotion.created_at', 'DESC')
            .getMany();
    }

    private async assertOwner(placeId: string, userId: string): Promise<void> {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        if (!place || place.claimedByUserId !== userId) {
            throw new ForbiddenException('No tienes permiso para editar este local');
        }
    }

    async create(placeId: string, userId: string, dto: CreatePromotionDto): Promise<Promotion> {
        await this.assertOwner(placeId, userId);

        if (dto.discountType && !['percentage', 'fixed_amount'].includes(dto.discountType)) {
            throw new BadRequestException('discountType inválido');
        }
        if (dto.discountType === 'percentage' && dto.discountValue != null && (dto.discountValue <= 0 || dto.discountValue > 100)) {
            throw new BadRequestException('El porcentaje de descuento debe estar entre 1 y 100');
        }

        const promotion = this.promotionsRepo.create({
            title: dto.title,
            description: dto.description,
            imageUrl: dto.imageUrl,
            startsAt: dto.startsAt,
            endsAt: dto.endsAt,
            discountType: dto.discountType ?? null,
            discountValue: dto.discountValue ?? null,
            placeId,
        });
        return this.promotionsRepo.save(promotion);
    }

    async delete(placeId: string, promotionId: string, userId: string): Promise<void> {
        await this.assertOwner(placeId, userId);
        const promotion = await this.promotionsRepo.findOne({ where: { id: promotionId, placeId } });
        if (!promotion) throw new NotFoundException('Promoción no encontrada');
        await this.promotionsRepo.remove(promotion);
    }
}
