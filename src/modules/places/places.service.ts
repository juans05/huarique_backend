import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Raw, In } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { Place } from './entities/place.entity';
import { Category } from './entities/category.entity';
import { Amenity } from './entities/amenity.entity';
import { PlaceSubmission } from './entities/place-submission.entity';
import { PlaceClaim } from './entities/place-claim.entity';
import { FavoritePlace } from './entities/favorite-place.entity';
import { PlaceVideo } from './entities/place-video.entity';
import { UploadService } from '../upload/upload.service';

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
        @InjectRepository(Amenity)
        private amenitiesRepository: Repository<Amenity>,
        @InjectRepository(PlaceSubmission)
        private submissionsRepository: Repository<PlaceSubmission>,
        @InjectRepository(PlaceClaim)
        private claimsRepository: Repository<PlaceClaim>,
        @InjectRepository(FavoritePlace)
        private favoritesRepository: Repository<FavoritePlace>,
        @InjectRepository(PlaceVideo)
        private videosRepository: Repository<PlaceVideo>,
        private uploadService: UploadService,
    ) { }


    async findAll(query: GetPlacesDto): Promise<PaginatedResponse<PlaceResponseDto>> {
        const { page, category, district, search, priceMin, priceMax, minRating, amenities, openNow } = query;
        const size = query.limitOrSize;
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

        if (priceMin != null || priceMax != null) {
            // A place with no price info can't be confirmed to fit a requested budget.
            queryBuilder.andWhere('place.price_min IS NOT NULL AND place.price_max IS NOT NULL');
            if (priceMin != null) queryBuilder.andWhere('place.price_max >= :priceMin', { priceMin });
            if (priceMax != null) queryBuilder.andWhere('place.price_min <= :priceMax', { priceMax });
        }

        if (minRating != null) {
            // Most imported places only have a Google rating (in-app `rating`
            // stays 0 until they get in-app reviews), so filter on whichever
            // is higher instead of the in-app one alone.
            queryBuilder.andWhere(
                'GREATEST(COALESCE(place.rating, 0), COALESCE(place.google_rating, 0)) >= :minRating',
                { minRating },
            );
        }

        if (amenities) {
            const slugs = amenities.split(',').map((s) => s.trim()).filter(Boolean);
            if (slugs.length) {
                // Place must have ALL requested amenities (not just any one of them).
                queryBuilder.andWhere(
                    `place.id IN (
                        SELECT pa.place_id FROM wuarike_db.place_amenities pa
                        INNER JOIN wuarike_db.amenities a ON a.id = pa.amenity_id
                        WHERE a.slug IN (:...slugs)
                        GROUP BY pa.place_id
                        HAVING COUNT(DISTINCT a.slug) = :slugCount
                    )`,
                    { slugs, slugCount: slugs.length },
                );
            }
        }

        if (openNow) {
            // ponytail: naive "H:MM AM/PM - H:MM AM/PM" parse of the free-text
            // open_hours_text column. Doesn't model per-day schedules, holidays,
            // or text like "24 horas" — places with unparseable hours are
            // treated as closed. Upgrade to a structured hours table if that
            // ever matters.
            const now = `(now() AT TIME ZONE 'America/Lima')::time`;
            const open = `to_timestamp(trim(split_part(place.open_hours_text, '-', 1)), 'HH12:MI AM')::time`;
            const close = `to_timestamp(trim(split_part(place.open_hours_text, '-', 2)), 'HH12:MI AM')::time`;
            queryBuilder
                .andWhere(`place.open_hours_text ~* '^\\s*[0-9]{1,2}:[0-9]{2}\\s*(AM|PM)\\s*-\\s*[0-9]{1,2}:[0-9]{2}\\s*(AM|PM)\\s*$'`)
                .andWhere(
                    `((${open} <= ${close} AND ${now} BETWEEN ${open} AND ${close}) OR (${open} > ${close} AND (${now} >= ${open} OR ${now} < ${close})))`,
                );
        }

        const hasOrigin = !!(query.latitude && query.longitude);
        if (hasOrigin) {
            const radiusInMeters = (query.radius || 5) * 1000;
            const origin = {
                type: 'Point',
                coordinates: [query.longitude, query.latitude],
            };

            queryBuilder.andWhere(
                `ST_DWithin(place.location, ST_GeomFromGeoJSON(:origin), :radius)`,
                { origin: JSON.stringify(origin), radius: radiusInMeters }
            );

            // Add distance (in km) for sorting/display
            queryBuilder.addSelect(
                `ST_Distance(place.location, ST_GeomFromGeoJSON(:origin)) / 1000`,
                'distance'
            );
            queryBuilder.orderBy('distance', 'ASC');
        }

        const total = await queryBuilder.getCount();

        queryBuilder.addOrderBy('place.name', 'ASC').skip(skip).take(size);

        // getManyAndCount() would silently drop the raw `distance` addSelect
        // (it only hydrates entity columns), so use getRawAndEntities() and
        // reattach distance onto each entity by position.
        const { entities, raw } = await queryBuilder.getRawAndEntities();
        if (hasOrigin) {
            entities.forEach((entity, i) => {
                if (raw[i]?.distance !== undefined) {
                    entity.distance = parseFloat(raw[i].distance);
                }
            });
        }

        // Transform entities to DTOs
        const transformedData = plainToInstance(PlaceResponseDto, entities, {
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

    async getAmenities() {
        return this.amenitiesRepository.find({
            order: { name: 'ASC' },
        });
    }

    async findOne(id: string): Promise<PlaceResponseDto> {
        const place = await this.placesRepository.findOne({
            where: { id, status: In(['active', 'pending']) },
            relations: ['category', 'district', 'tags', 'amenities', 'dishes', 'claimedBy'],
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

    async getMySubmissions(userId: string): Promise<PlaceSubmission[]> {
        return this.submissionsRepository.find({
            where: { submittedByUserId: userId },
            order: { createdAt: 'DESC' },
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

    async isFavorite(userId: string, placeId: string): Promise<boolean> {
        const existing = await this.favoritesRepository.findOne({
            where: { userId, placeId },
        });
        return existing !== null;
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

    // --- Videos ---

    async findAllVideos(placeId: string, page: number = 1, limit: number = 10) {
        const [data, total] = await this.videosRepository.findAndCount({
            where: { placeId },
            relations: ['user'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async addVideo(userId: string, placeId: string, file: Express.Multer.File) {
        // Verify place exists
        await this.findOne(placeId);

        // Upload to Cloudinary
        const result = await this.uploadService.uploadVideo(file);

        // Save to DB
        const video = this.videosRepository.create({
            url: result.secure_url,
            thumbnailUrl: result.secure_url.replace(/\.[^/.]+$/, ".jpg"), // Cloudinary auto-thumb trick
            duration: Math.round(result.duration || 0),
            placeId,
            userId,
        });

        return this.videosRepository.save(video);
    }
}

