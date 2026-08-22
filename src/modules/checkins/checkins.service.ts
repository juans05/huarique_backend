import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { Checkin } from './entities/checkin.entity';
import { CheckinLike } from './entities/checkin-like.entity';
import { CheckinPhoto } from './entities/checkin-photo.entity';
import { PlaceInfoSuggestion } from './entities/place-info-suggestion.entity';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { SubmitInfoSuggestionDto } from './dto/submit-info-suggestion.dto';
import { UsersService } from '../users/users.service';
import { PlacesService } from '../places/places.service';
import { Place } from '../places/entities/place.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AntiFraudService } from './services/anti-fraud.service';
import { PaginatedResponse } from '../../common/dto/pagination.dto';

// Cantidad de votantes distintos que deben coincidir en el mismo valor
// sugerido antes de aplicar el cambio al local.
const INFO_SUGGESTION_CONSENSUS_THRESHOLD = 3;

@Injectable()
export class CheckinsService {
    constructor(
        @InjectRepository(Checkin)
        private checkinsRepository: Repository<Checkin>,
        @InjectRepository(CheckinLike)
        private likesRepository: Repository<CheckinLike>,
        @InjectRepository(CheckinPhoto)
        private photosRepository: Repository<CheckinPhoto>,
        @InjectRepository(PlaceInfoSuggestion)
        private infoSuggestionsRepository: Repository<PlaceInfoSuggestion>,
        @InjectRepository(Place)
        private placesRepository: Repository<Place>,
        private usersService: UsersService,
        private placesService: PlacesService,
        private auditLogService: AuditLogService,
        private antiFraudService: AntiFraudService,
        @InjectDataSource()
        private dataSource: DataSource,
    ) { }

    async create(userId: string, dto: CreateCheckinDto): Promise<Checkin> {
        const place = await this.placesService.findOne(dto.placeId);

        const cooldown = await this.antiFraudService.validateCooldown(userId, dto.placeId);
        if (!cooldown.isValid) {
            throw new BadRequestException({
                message: `Ya hiciste check-in aquí hace poco. Intenta de nuevo en ${Math.ceil((cooldown.remainingTime ?? 0) / 60)} minutos.`,
                error: cooldown.error,
                remainingTime: cooldown.remainingTime,
            });
        }

        const dailyLimit = await this.antiFraudService.validateDailyLimit(userId);
        if (!dailyLimit.isValid) {
            throw new BadRequestException({
                message: 'Llegaste al límite de 10 check-ins por día. Vuelve mañana.',
                error: dailyLimit.error,
            });
        }

        if (dto.latitude != null && dto.longitude != null) {
            const speedCheck = await this.antiFraudService.validateSpeed(userId, dto.latitude, dto.longitude);
            if (speedCheck.suspicious) {
                await this.auditLogService.log({
                    action: 'checkin_suspicious_speed',
                    entityType: 'checkin',
                    placeId: dto.placeId,
                    userId,
                    metadata: { speedKmh: speedCheck.speed, latitude: dto.latitude, longitude: dto.longitude },
                    description: `Check-in marcado como sospechoso: ${speedCheck.speed} km/h desde el check-in anterior`,
                });
            }
        }

        const { photos, latitude, longitude, ...checkinData } = dto;

        // The check-in and its photos must land together: run them in a single
        // DB transaction so a failed photo insert can't leave an orphaned
        // check-in with missing photos.
        const savedCheckin = await this.dataSource.transaction(async (manager) => {
            const checkin = manager.create(Checkin, {
                ...checkinData,
                userId,
            });
            const saved = await manager.save(checkin);

            if (dto.photos && dto.photos.length > 0) {
                const photoEntities = dto.photos.map(url => manager.create(CheckinPhoto, {
                    checkinId: saved.id,
                    url,
                }));
                await manager.save(photoEntities);
            }

            return saved;
        });

        // Update Place Rating
        if (dto.rating && dto.rating > 0) {
            const currentTotal = place.totalReviews || 0;
            const currentRating = Number(place.rating) || 0;
            const newTotal = currentTotal + 1;
            const newRating = ((currentRating * currentTotal) + dto.rating) / newTotal;

            await this.placesService.updateRating(place.id, newRating, newTotal);
        }

        // Award points
        let points = 10;
        if (dto.photoUrl || (dto.photos && dto.photos.length > 0)) {
            points += 5;
        }
        await this.usersService.addPoints(userId, points);

        return savedCheckin;
    }

    async getFeed(
        page = 1,
        size = 20,
        district?: string,
        userId?: string,
        placeId?: string,
        sort: 'recent' | 'top_rated' | 'low_rated' | 'most_liked' = 'recent',
        hasPhotos?: boolean,
    ): Promise<PaginatedResponse<any>> {
        const skip = (page - 1) * size;

        const queryBuilder = this.checkinsRepository.createQueryBuilder('checkin')
            .leftJoinAndSelect('checkin.user', 'user')
            .leftJoinAndSelect('checkin.place', 'place')
            .leftJoinAndSelect('checkin.photos', 'photos');

        switch (sort) {
            case 'top_rated':
                queryBuilder.orderBy('checkin.rating', 'DESC').addOrderBy('checkin.createdAt', 'DESC');
                break;
            case 'low_rated':
                queryBuilder.orderBy('checkin.rating', 'ASC').addOrderBy('checkin.createdAt', 'DESC');
                break;
            case 'most_liked':
                queryBuilder.orderBy('checkin.likesCount', 'DESC').addOrderBy('checkin.createdAt', 'DESC');
                break;
            default:
                queryBuilder.orderBy('checkin.createdAt', 'DESC');
        }

        if (district) {
            queryBuilder.andWhere('place.district = :district', { district });
        }

        if (placeId) {
            queryBuilder.andWhere('checkin.placeId = :placeId', { placeId });
        }

        if (hasPhotos) {
            queryBuilder.andWhere(
                `(checkin.photoUrl IS NOT NULL OR EXISTS (
                    SELECT 1 FROM wuarike_db.checkin_photos cp WHERE cp.checkin_id = checkin.id
                ))`,
            );
        }

        const [data, total] = await queryBuilder
            .skip(skip)
            .take(size)
            .getManyAndCount();

        // Map to include liked status if userId is provided
        let results = data;
        if (userId) {
            const checkinIds = data.map(c => c.id);
            if (checkinIds.length > 0) {
                const myLikes = await this.likesRepository.find({
                    where: { userId, checkinId: In(checkinIds) }
                } as any);
                const likedIds = new Set(myLikes.map(l => l.checkinId));
                results = data.map(c => ({ ...c, isLikedByMe: likedIds.has(c.id) }));
            }
        }

        return {
            data: results,
            meta: {
                total,
                page,
                size,
                totalPages: Math.ceil(total / size),
            },
        };
    }

    async like(userId: string, checkinId: string): Promise<number> {
        const checkin = await this.checkinsRepository.findOne({ where: { id: checkinId } });
        if (!checkin) throw new NotFoundException('Check-in no encontrado');

        const existingLike = await this.likesRepository.findOne({
            where: { userId, checkinId },
        });

        if (existingLike) return checkin.likesCount;

        await this.likesRepository.save({ userId, checkinId });
        await this.checkinsRepository.increment({ id: checkinId }, 'likesCount', 1);

        // Award points to the author of the checkin
        await this.usersService.addPoints(checkin.userId, 5);

        return checkin.likesCount + 1;
    }

    async unlike(userId: string, checkinId: string): Promise<number> {
        const checkin = await this.checkinsRepository.findOne({ where: { id: checkinId } });
        if (!checkin) throw new NotFoundException('Check-in no encontrado');

        const result = await this.likesRepository.delete({ userId, checkinId });
        if (result.affected && result.affected > 0) {
            await this.checkinsRepository.decrement({ id: checkinId }, 'likesCount', 1);
            // Optional: Remove points if unliked? Better not to keep it simple and avoid abuse.
            return checkin.likesCount - 1;
        }

        return checkin.likesCount;
    }

    async submitInfoSuggestion(
        userId: string,
        dto: SubmitInfoSuggestionDto,
    ): Promise<{ votes: number; applied: boolean }> {
        await this.placesService.findOne(dto.placeId);

        const normalizedValue = dto.field === 'menu' ? 'outdated' : (dto.suggestedValue ?? '').trim();

        const existing = await this.infoSuggestionsRepository.findOne({
            where: { placeId: dto.placeId, field: dto.field, userId },
        });
        if (existing) {
            existing.suggestedValue = normalizedValue;
            existing.applied = false;
            await this.infoSuggestionsRepository.save(existing);
        } else {
            await this.infoSuggestionsRepository.save(
                this.infoSuggestionsRepository.create({
                    placeId: dto.placeId,
                    field: dto.field,
                    userId,
                    suggestedValue: normalizedValue,
                }),
            );
        }

        const matching = await this.infoSuggestionsRepository.find({
            where: {
                placeId: dto.placeId,
                field: dto.field,
                suggestedValue: normalizedValue,
                applied: false,
            },
        });

        if (matching.length < INFO_SUGGESTION_CONSENSUS_THRESHOLD) {
            return { votes: matching.length, applied: false };
        }

        if (dto.field === 'phone') {
            await this.placesRepository.update(dto.placeId, { phone: normalizedValue });
        } else if (dto.field === 'address') {
            await this.placesRepository.update(dto.placeId, { address: normalizedValue });
        } else if (dto.field === 'hours') {
            await this.placesRepository.update(dto.placeId, { openHoursText: normalizedValue });
        } else {
            await this.placesRepository.update(dto.placeId, { menuNeedsReview: true });
        }

        await this.infoSuggestionsRepository.update(
            { id: In(matching.map((m) => m.id)) },
            { applied: true },
        );

        await this.auditLogService.log({
            action: 'place_info_suggestion_applied',
            entityType: 'place',
            entityId: dto.placeId,
            placeId: dto.placeId,
            userId,
            metadata: { field: dto.field, value: normalizedValue, voterIds: matching.map((m) => m.userId) },
            description: `Actualizado por consenso de ${matching.length} usuarios en check-in: ${dto.field} → ${normalizedValue}`,
        });

        return { votes: matching.length, applied: true };
    }
}
