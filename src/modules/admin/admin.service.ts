import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';
import { PlaceSubmission } from '../places/entities/place-submission.entity';
import { PlaceClaim } from '../places/entities/place-claim.entity';
import { Category } from '../places/entities/category.entity';
import { Ubigeo } from '../ubigeo/entities/ubigeo.entity';
import { Checkin } from '../checkins/entities/checkin.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { GamificationService } from '../gamification/gamification.service';

@Injectable()
export class AdminService {
    constructor(
        @InjectRepository(Place)
        private placesRepository: Repository<Place>,
        @InjectRepository(PlaceSubmission)
        private submissionsRepository: Repository<PlaceSubmission>,
        @InjectRepository(PlaceClaim)
        private claimsRepository: Repository<PlaceClaim>,
        @InjectRepository(Category)
        private categoryRepository: Repository<Category>,
        @InjectRepository(Ubigeo)
        private ubigeoRepository: Repository<Ubigeo>,
        @InjectRepository(Checkin)
        private checkinsRepository: Repository<Checkin>,
        @InjectRepository(User)
        private usersRepository: Repository<User>,
        private usersService: UsersService,
        private gamificationService: GamificationService,
    ) { }

    async getDashboardStats() {
        const totalActivePlaces = await this.placesRepository.count({ where: { status: 'active' } });
        const totalUsers = await this.usersRepository.count();
        const totalCheckins = await this.checkinsRepository.count();

        // Trending: Simple score = views + (checkins * 5)
        // We fetch top 10 by views first to optimize, then re-sort by score in memory if needed, 
        // or just use query builder.
        const trendingPlaces = await this.placesRepository.createQueryBuilder('place')
            .leftJoin('place.checkins', 'checkin')
            .addSelect('COUNT(checkin.id)', 'checkinsCount')
            .where('place.status = :status', { status: 'active' })
            .groupBy('place.id')
            .orderBy('place.views + (COUNT(checkin.id) * 5)', 'DESC')
            .limit(5)
            .getMany();

        return {
            overview: {
                totalPlaces: totalActivePlaces,
                totalUsers,
                totalCheckins,
            },
            trending: trendingPlaces
        };
    }

    async generateAiDescription(placeName: string, district: string, category: string, keywords: string[]): Promise<string> {
        // Mock AI / Heuristic Generator
        // In a real scenario, this would call OpenAI/Gemini API.

        const adjectives = ['increíble', 'delicioso', 'auténtico', 'acogedor', 'imperdible'];
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];

        const intro = `Descubre ${placeName}, un rincón ${adj} en el corazón de ${district}.`;
        const body = `Especialistas en ${category.toLowerCase()}, este warike destaca por su sazón inigualable y ambiente tradicional.`;
        const highlights = keywords.length > 0
            ? `No te puedes perder sus: ${keywords.join(', ')}.`
            : `Ideal para disfrutar con amigos y familia.`;
        const outro = `¡Visítalo y vive la verdadera experiencia gastronómica!`;

        return `${intro} ${body} ${highlights} ${outro}`;
    }

    async getPendingSubmissions() {
        return this.submissionsRepository.find({
            where: { status: 'pending' },
            relations: ['submittedBy'],
            order: { createdAt: 'DESC' },
        });
    }

    async approveSubmission(submissionId: string, adminId: string) {
        const submission = await this.submissionsRepository.findOne({
            where: { id: submissionId },
        });

        if (!submission || submission.status !== 'pending') {
            throw new NotFoundException('Propuesta no encontrada o ya procesada');
        }

        // Resolve relations
        const category = await this.categoryRepository.findOne({ where: { id: submission.categoryId } });
        if (!category) {
            throw new BadRequestException(`Category with ID '${submission.categoryId}' not found.`);
        }

        const district = await this.ubigeoRepository.findOne({ where: { district: submission.district } });
        if (!district) {
            throw new BadRequestException(`District '${submission.district}' not found.`);
        }

        // Create new Place
        const place = this.placesRepository.create({
            name: submission.name,
            nameNormalized: submission.nameNormalized,
            description: submission.description,
            category: category,
            district: district,
            address: submission.address,
            latitude: submission.latitude,
            longitude: submission.longitude,
            location: {
                type: 'Point',
                coordinates: [Number(submission.longitude), Number(submission.latitude)],
            },
            phone: submission.phone,
            website: submission.website,
            coverImageUrl: submission.coverImageUrl,
            status: 'active',
        });

        const savedPlace = await this.placesRepository.save(place);

        // Update submission status
        submission.status = 'approved';
        submission.reviewedByAdminId = adminId;
        submission.reviewedAt = new Date();
        await this.submissionsRepository.save(submission);

        // Award points (50 pts for approved submission)
        await this.usersService.addPoints(submission.submittedByUserId, 50);
        await this.gamificationService.logPoints(
            submission.submittedByUserId,
            50,
            'place_approved',
            savedPlace.id,
        );

        return { message: 'Lugar aprobado exitosamente', placeId: savedPlace.id };
    }

    async rejectSubmission(submissionId: string, adminId: string, reason: string) {
        const submission = await this.submissionsRepository.findOne({
            where: { id: submissionId },
        });

        if (!submission || submission.status !== 'pending') {
            throw new NotFoundException('Propuesta no encontrada o ya procesada');
        }

        submission.status = 'rejected';
        submission.reviewedByAdminId = adminId;
        submission.reviewedAt = new Date();
        submission.rejectionReason = reason;

        await this.submissionsRepository.save(submission);

        return { message: 'Propuesta rechazada' };
    }

    async getPendingClaims() {
        return this.claimsRepository.find({
            where: { status: 'pending' },
            relations: ['place', 'user'],
            order: { createdAt: 'DESC' },
        });
    }


    async verifyClaim(claimId: string, adminId: string) {
        const claim = await this.claimsRepository.findOne({
            where: { id: claimId },
            relations: ['place'],
        });

        if (!claim || claim.status !== 'pending') {
            throw new NotFoundException('Reclamo no encontrado o ya procesado');
        }

        // Update claim
        claim.status = 'verified';
        claim.verifiedByAdminId = adminId;
        claim.verifiedAt = new Date();
        await this.claimsRepository.save(claim);

        // Update place
        await this.placesRepository.update(claim.placeId, {
            isVerified: true,
            verifiedAt: new Date(),
            claimedByUserId: claim.userId,
        });

        // Update user role
        await this.usersService.updateRole(claim.userId, 'business');

        return { message: 'Negocio verificado exitosamente' };
    }

    // --- User Management ---

    async getUsers(page: number = 1, limit: number = 10, search?: string) {
        const query = this.usersRepository.createQueryBuilder('user')
            .orderBy('user.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        if (search) {
            query.where('user.fullName ILIKE :search OR user.email ILIKE :search', { search: `%${search}%` });
        }

        const [users, total] = await query.getManyAndCount();

        return {
            data: users,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            }
        };
    }

    async banUser(userId: string) {
        return this.usersRepository.update(userId, { isBanned: true });
    }

    async activateUser(userId: string) {
        return this.usersRepository.update(userId, { isBanned: false });
    }

    async createUser(createUserDto: any) {
        const { email, password, fullName, role } = createUserDto;

        // Check if exists
        const exists = await this.usersRepository.findOne({ where: { email } });
        if (exists) {
            throw new BadRequestException('El usuario ya existe');
        }

        const user = await this.usersService.create(email, password, fullName, true); // verified=true
        if (role && role !== 'user') {
            await this.usersService.updateRole(user.id, role);
        }
        return user;
    }
}
