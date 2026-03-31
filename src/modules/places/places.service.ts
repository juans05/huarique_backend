import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Raw } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { Place } from './entities/place.entity';
import { Category } from './entities/category.entity';
import { PlaceSubmission } from './entities/place-submission.entity';
import { PlaceClaim } from './entities/place-claim.entity';
import { FavoritePlace } from './entities/favorite-place.entity';
import { CreatePlaceSubmissionDto } from './dto/create-place-submission.dto';
import { CreatePlaceClaimDto } from './dto/create-place-claim.dto';
import { GetPlacesDto } from './dto/get-places.dto';
import { PlaceResponseDto } from './dto/place-response.dto';
import { PaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class PlacesService {
    constructor(
        @InjectRepository(Place)
        private placesRepository: Repository<Place>,
        @InjectRepository(Category)
        private categoriesRepository: Repository<Category>,
        @InjectRepository(PlaceSubmission)
        private submissionsRepository: Repository<PlaceSubmission>,
        @InjectRepository(PlaceClaim)
        private claimsRepository: Repository<PlaceClaim>,
        @InjectRepository(FavoritePlace)
        private favoritesRepository: Repository<FavoritePlace>,
    ) { }

    async findAll(query: GetPlacesDto): Promise<PaginatedResponse<PlaceResponseDto>> {
        const { page, size, category, district, search } = query;
        const skip = (page - 1) * size;

        const queryBuilder = this.placesRepository.createQueryBuilder('place')
            .leftJoinAndSelect('place.category', 'category')
            .leftJoinAndSelect('place.district', 'district')
            .leftJoinAndSelect('place.tags', 'tags')
            .leftJoinAndSelect('place.amenities', 'amenities');

        queryBuilder.where('place.status = :status', { status: 'active' });

        if (category) {
            queryBuilder.andWhere('(category.slug = :category OR category.name = :category)', { category });
        }

        if (district) {
            queryBuilder.andWhere('district.district = :district', { district });
        }

        if (search) {
            queryBuilder.andWhere(
                '(LOWER(place.name) LIKE LOWER(:search) OR LOWER(place.description) LIKE LOWER(:search))',
                { search: `%${search}%` },
            );
        }

        if (query.latitude && query.longitude) {
            const radiusInMeters = (query.radius || 5) * 1000;
            const origin = {
                type: 'Point',
                coordinates: [query.longitude, query.latitude],
            };

            queryBuilder.andWhere(
                `ST_DWithin(place.location, ST_GeomFromGeoJSON(:origin), :radius)`,
                { origin: JSON.stringify(origin), radius: radiusInMeters }
            );

            // Add distance for sorting/display
            queryBuilder.addSelect(
                `ST_Distance(place.location, ST_GeomFromGeoJSON(:origin))`,
                'distance'
            );
            queryBuilder.orderBy('distance', 'ASC');
        }

        const [data, total] = await queryBuilder
            //.orderBy('place.isVerified', 'DESC')
            .addOrderBy('place.name', 'ASC')
            .skip(skip)
            .take(size)
            .getManyAndCount();

        // Transform entities to DTOs
        const transformedData = plainToInstance(PlaceResponseDto, data, {
            excludeExtraneousValues: true,
        });

        return {
            data: transformedData,
            meta: {
                total,
                page,
                size,
                totalPages: Math.ceil(total / size),
            },
        };
    }

    async getCategories() {
        return this.categoriesRepository.find({
            order: { name: 'ASC' },
        });
    }

    async findOne(id: string): Promise<PlaceResponseDto> {
        const place = await this.placesRepository.findOne({
            where: { id, status: 'active' },
            relations: ['category', 'district', 'tags', 'amenities', 'dishes']
        });
        if (!place) {
            throw new NotFoundException('Lugar no encontrado');
        }

        // Increment views asynchronously to not block response
        this.placesRepository.increment({ id }, 'views', 1).catch(err => {
            console.error('Error incrementing views for place ' + id, err);
        });

        // Add views to the returned place object if we want the current request to see it, 
        // strictly speaking `increment` happens in DB so the `place` object above is "stale" by 1 view
        // but that's negligible. 
        // We do typically want to return the updated object or at least the object as it was.

        return plainToInstance(PlaceResponseDto, place, {
            excludeExtraneousValues: true,
        });
    }

    async submitPlace(
        userId: string,
        dto: CreatePlaceSubmissionDto,
    ): Promise<PlaceSubmission> {
        const nameNormalized = this.normalizeName(dto.name);

        // Check for duplicates in existing places or pending submissions
        const existing = await this.placesRepository.findOne({
            where: {
                nameNormalized,
                district: { district: dto.district }
            },
            relations: ['district']
        });
        if (existing) {
            throw new ConflictException('Este lugar ya existe en nuestro sistema');
        }

        const pending = await this.submissionsRepository.findOne({
            where: { nameNormalized, district: dto.district, status: 'pending' },
        });
        if (pending) {
            throw new ConflictException(
                'Ya hay una propuesta pendiente para este lugar',
            );
        }

        const submission = this.submissionsRepository.create({
            ...dto,
            submittedByUserId: userId,
            nameNormalized,
            status: 'pending',
        });

        return this.submissionsRepository.save(submission);
    }

    async claimPlace(
        userId: string,
        placeId: string,
        dto: CreatePlaceClaimDto,
    ): Promise<PlaceClaim> {
        const place = await this.findOne(placeId);
        if (place.isVerified) {
            throw new BadRequestException('Este lugar ya está verificado');
        }

        const existingClaim = await this.claimsRepository.findOne({
            where: { placeId, status: 'pending' },
        });
        if (existingClaim) {
            throw new ConflictException('Ya hay una solicitud de reclamo pendiente');
        }

        const claim = this.claimsRepository.create({
            ...dto,
            placeId,
            userId,
            status: 'pending',
            verificationCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        });

        return this.claimsRepository.save(claim);
    }

    async getDiscovery(district?: string, category?: string, limit = 10): Promise<PlaceResponseDto[]> {
        // Discovery Algorithm: score based on recent activity (last 7 days)
        // score = (checkins_7d * 10 + likes_7d * 5)

        const query = this.placesRepository.createQueryBuilder('place')
            .leftJoinAndSelect('place.category', 'category')
            .leftJoinAndSelect('place.district', 'district')
            .leftJoinAndSelect('place.tags', 'tags')
            .leftJoinAndSelect('place.amenities', 'amenities')
            .leftJoin('place.checkins', 'checkin', 'checkin.createdAt >= :weekAgo', {
                weekAgo: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            })
            .addSelect('COUNT(checkin.id)', 'recentCheckinsCount')
            .addSelect('SUM(COALESCE(checkin.likesCount, 0))', 'recentLikesCount')
            .where('place.status = :status', { status: 'active' });

        if (district) {
            query.andWhere('district.district = :district', { district });
        }

        if (category) {
            query.andWhere('(category.slug = :category OR category.name = :category)', { category });
        }

        query.groupBy('place.id')
            .addGroupBy('category.id')
            .addGroupBy('district.id')
            .orderBy('(COUNT(checkin.id) * 10 + SUM(COALESCE(checkin.likesCount, 0)) * 5)', 'DESC')
            .limit(limit);

        const places = await query.getMany();

        return plainToInstance(PlaceResponseDto, places, {
            excludeExtraneousValues: true,
        });
    }

    async updateRating(id: string, newRating: number, newTotalReviews: number): Promise<void> {
        await this.placesRepository.update(id, {
            rating: newRating,
            totalReviews: newTotalReviews,
        });
    }

    private normalizeName(name: string): string {
        return name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // remove accents
            .replace(/[^a-z0-9]/g, ''); // remove special chars
    }

    async addFavorite(userId: string, placeId: string): Promise<void> {
        // Verify place exists
        await this.findOne(placeId);

        // Check if already favorited
        const existing = await this.favoritesRepository.findOne({
            where: { userId, placeId },
        });

        if (existing) {
            throw new ConflictException('Este lugar ya está en tus favoritos');
        }

        const favorite = this.favoritesRepository.create({
            userId,
            placeId,
        });

        await this.favoritesRepository.save(favorite);
    }

    async removeFavorite(userId: string, placeId: string): Promise<void> {
        const favorite = await this.favoritesRepository.findOne({
            where: { userId, placeId },
        });

        if (!favorite) {
            throw new NotFoundException('Este lugar no está en tus favoritos');
        }

        await this.favoritesRepository.remove(favorite);
    }
}
