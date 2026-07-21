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
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { UsersService } from '../users/users.service';
import { PlacesService } from '../places/places.service';
import { PaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class CheckinsService {
    constructor(
        @InjectRepository(Checkin)
        private checkinsRepository: Repository<Checkin>,
        @InjectRepository(CheckinLike)
        private likesRepository: Repository<CheckinLike>,
        @InjectRepository(CheckinPhoto)
        private photosRepository: Repository<CheckinPhoto>,
        private usersService: UsersService,
        private placesService: PlacesService,
        @InjectDataSource()
        private dataSource: DataSource,
    ) { }

    async create(userId: string, dto: CreateCheckinDto): Promise<Checkin> {
        const place = await this.placesService.findOne(dto.placeId);

        const { photos, ...checkinData } = dto;

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
    ): Promise<PaginatedResponse<any>> {
        const skip = (page - 1) * size;

        const queryBuilder = this.checkinsRepository.createQueryBuilder('checkin')
            .leftJoinAndSelect('checkin.user', 'user')
            .leftJoinAndSelect('checkin.place', 'place')
            .leftJoinAndSelect('checkin.photos', 'photos')
            .orderBy('checkin.createdAt', 'DESC');

        if (district) {
            queryBuilder.andWhere('place.district = :district', { district });
        }

        if (placeId) {
            queryBuilder.andWhere('checkin.placeId = :placeId', { placeId });
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
}
