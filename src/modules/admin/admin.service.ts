import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';
import { PlacePhoto } from '../places/entities/place-photo.entity';
import { PlaceVideo } from '../places/entities/place-video.entity';
import { PlaceSubmission } from '../places/entities/place-submission.entity';
import { PlaceClaim } from '../places/entities/place-claim.entity';
import { Category } from '../places/entities/category.entity';
import { Amenity } from '../places/entities/amenity.entity';
import { Ubigeo } from '../ubigeo/entities/ubigeo.entity';
import { Checkin } from '../checkins/entities/checkin.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { MailService } from '../../common/services/mail.service';
import { randomBytes } from 'crypto';
import { GamificationService } from '../gamification/gamification.service';
import { AdminUpdatePlaceDto } from './dto/update-place.dto';
import { ImportScrapedPlaceDto } from './dto/import-scraped-place.dto';
import { ImportScrapedReviewDto } from './dto/import-scraped-reviews.dto';
import { GoogleReview } from '../places/entities/google-review.entity';
import { ComplaintBookEntry } from '../complaint-book/entities/complaint-book-entry.entity';
import { buildFolio } from '../complaint-book/complaint-book.service';
import { FavoritePlace } from '../places/entities/favorite-place.entity';
import { WuarikesHereRequest } from '../places/entities/wuarikes-here-request.entity';

// "Lima Cercado" en el scraper corresponde al distrito "Lima" en la tabla ubigeos
const DISTRICT_ALIASES: Record<string, string> = { 'Lima Cercado': 'Lima' };

// Mapeo best-effort de la categoría textual de Google a las categorías existentes.
// Lo que no matchee queda sin categoryId (se conserva el texto crudo en metadata).
const CATEGORY_KEYWORDS: [RegExp, string][] = [
    [/peruan/, 'Criollo'],
    [/chino|mandarina|^china$/, 'Chifa'],
    [/japon|sushi/, 'Japonesa'],
    [/italian/, 'Italiana'],
    [/mexican/, 'Mexicana'],
    [/pollo/, 'Pollo a la Brasa'],
    [/marisco|marisqueria/, 'Marino'],
    [/sopa/, 'Sopas'],
    [/comida rapida|hamburguesa/, 'Comida Rápida'],
    [/cafe|cafeteria/, 'Café'],
    [/sanguche|sandwich/, 'Sanguchería'],
    [/buffet/, 'Buffet'],
    [/postre/, 'Postres'],
    [/jugo/, 'Juguerias'],
];

function normalize(s: string): string {
    return (s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function slugify(s: string): string {
    return normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function extractGooglePlaceId(mapsUrl: string | undefined): string | null {
    if (!mapsUrl) return null;
    const m = mapsUrl.match(/!19s(ChIJ[^!&]+)/);
    return m ? m[1] : null;
}

// "url1, url2\nurl3" -> ['url1', 'url2', 'url3']
function splitList(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

@Injectable()
export class AdminService {
    constructor(
        @InjectRepository(Place)
        private placesRepository: Repository<Place>,
        @InjectRepository(PlacePhoto)
        private placePhotosRepository: Repository<PlacePhoto>,
        @InjectRepository(PlaceVideo)
        private placeVideosRepository: Repository<PlaceVideo>,
        @InjectRepository(PlaceSubmission)
        private submissionsRepository: Repository<PlaceSubmission>,
        @InjectRepository(PlaceClaim)
        private claimsRepository: Repository<PlaceClaim>,
        @InjectRepository(Category)
        private categoryRepository: Repository<Category>,
        @InjectRepository(Amenity)
        private amenityRepository: Repository<Amenity>,
        @InjectRepository(Ubigeo)
        private ubigeoRepository: Repository<Ubigeo>,
        @InjectRepository(Checkin)
        private checkinsRepository: Repository<Checkin>,
        @InjectRepository(User)
        private usersRepository: Repository<User>,
        @InjectRepository(GoogleReview)
        private googleReviewsRepository: Repository<GoogleReview>,
        @InjectRepository(ComplaintBookEntry)
        private complaintsRepository: Repository<ComplaintBookEntry>,
        @InjectRepository(FavoritePlace)
        private favoritesRepository: Repository<FavoritePlace>,
        @InjectRepository(WuarikesHereRequest)
        private wuarikesHereRepository: Repository<WuarikesHereRequest>,
        private usersService: UsersService,
        private gamificationService: GamificationService,
        private mailService: MailService,
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
            relations: ['submittedBy', 'category'],
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
            openHoursText: submission.openHoursText,
            menuImageUrls: submission.menuImageUrls,
            status: 'active',
        });

        const savedPlace = await this.placesRepository.save(place);

        // Todas las fotos enviadas (incluida la portada) pasan a la galería del
        // restaurante — así no depende de que alguien haga check-in para tener fotos.
        const photoUrls = submission.photoUrls?.length ? submission.photoUrls : [submission.coverImageUrl].filter(Boolean);
        if (photoUrls.length > 0) {
            const photos = photoUrls.map((url) =>
                this.placePhotosRepository.create({ url, placeId: savedPlace.id, userId: submission.submittedByUserId }),
            );
            await this.placePhotosRepository.save(photos);
        }

        if (submission.videoUrl) {
            await this.placeVideosRepository.save(
                this.placeVideosRepository.create({
                    url: submission.videoUrl,
                    placeId: savedPlace.id,
                    userId: submission.submittedByUserId,
                }),
            );
        }

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

    async rejectClaim(claimId: string, adminId: string) {
        const claim = await this.claimsRepository.findOne({
            where: { id: claimId },
        });

        if (!claim || claim.status !== 'pending') {
            throw new NotFoundException('Reclamo no encontrado o ya procesado');
        }

        claim.status = 'rejected';
        claim.verifiedByAdminId = adminId;
        claim.verifiedAt = new Date();

        await this.claimsRepository.save(claim);

        return { message: 'Reclamo rechazado' };
    }

    async getComplaints() {
        const complaints = await this.complaintsRepository.find({
            order: { createdAt: 'DESC' },
        });
        return complaints.map((c) => ({ ...c, folio: buildFolio(c) }));
    }

    async resolveComplaint(complaintId: string, adminId: string, response: string) {
        const complaint = await this.complaintsRepository.findOne({
            where: { id: complaintId },
        });

        if (!complaint || complaint.status !== 'pending') {
            throw new NotFoundException('Reclamo no encontrado o ya fue respondido');
        }

        complaint.status = 'resolved';
        complaint.providerResponse = response;
        complaint.respondedByAdminId = adminId;
        complaint.respondedAt = new Date();

        await this.complaintsRepository.save(complaint);

        return { message: 'Respuesta registrada' };
    }

    // --- User Management ---

    async getUsers(page: number = 1, limit: number = 10, search?: string) {
        const query = this.usersRepository.createQueryBuilder('user')
            .orderBy('user.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        if (search) {
            query.andWhere('user.fullName ILIKE :search OR user.email ILIKE :search', { search: `%${search}%` });
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

    /** Link para que el usuario elija una contraseña nueva; al guardarla también queda activada la cuenta. */
    async sendAccessEmail(userId: string) {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('Usuario no encontrado');

        const resetCode = randomBytes(24).toString('hex');
        await this.usersService.setVerificationCode(user.id, resetCode, 48 * 60 * 60 * 1000);
        await this.mailService.sendAccessLink(user.email, user.fullName, resetCode);
        return { message: `Correo enviado a ${user.email}` };
    }

    async createUser(createUserDto: any) {
        const { email, password, fullName, role } = createUserDto ?? {};
        if (!email || !password || !fullName) throw new BadRequestException('Nombre, correo y contraseña son obligatorios');
        if (role && !['user', 'business', 'admin', 'sales'].includes(role)) throw new BadRequestException('Rol no válido');

        // Check if exists
        const exists = await this.usersRepository.findOne({ where: { email } });
        if (exists) {
            throw new BadRequestException('El usuario ya existe');
        }

        // Queda sin verificar hasta que el usuario abra el link de activación (login lo bloquea mientras tanto).
        const user = await this.usersService.create(email, password, fullName, false);
        if (role && role !== 'user') {
            await this.usersService.updateRole(user.id, role);
        }

        const activationCode = randomBytes(24).toString('hex');
        await this.usersService.setVerificationCode(user.id, activationCode, 48 * 60 * 60 * 1000);
        try {
            await this.mailService.sendAccountActivation(email, fullName, role, activationCode);
        } catch (error) {
            // Sin correo no hay forma de activarla: borrarla para que el admin pueda reintentar con el mismo email.
            await this.usersRepository.delete(user.id);
            throw error;
        }

        const { passwordHash, ...safeUser } = user;
        return safeUser;
    }

    // --- Place Management ---

    async getPlaces(page: number = 1, limit: number = 10, search?: string) {
        const query = this.placesRepository.createQueryBuilder('place')
            .leftJoinAndSelect('place.category', 'category')
            .leftJoinAndSelect('place.district', 'district')
            .orderBy('place.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        if (search) {
            query.where('place.name ILIKE :search', { search: `%${search}%` });
        }

        const [places, total] = await query.getManyAndCount();

        return {
            data: places,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            }
        };
    }

    async updatePlace(id: string, updateData: AdminUpdatePlaceDto) {
        const place = await this.placesRepository.findOne({ where: { id } });
        if (!place) {
            throw new NotFoundException('Lugar no encontrado');
        }

        // Apply updates
        Object.assign(place, updateData);
        return this.placesRepository.save(place);
    }

    /**
     * Crea restaurantes en la BD a partir del CSV del scraper de Google Maps o de la
     * plantilla Excel de carga manual (docs/plantilla-restaurantes.xlsx).
     * Idempotente: si un googlePlaceId ya existe, se salta. Devuelve el detalle
     * de importados/saltados/fallidos para que un script pueda repetir el lote.
     */
    async importScrapedPlaces(rows: ImportScrapedPlaceDto[], adminUserId: string) {
        const categories = await this.categoryRepository.find();
        const amenities = await this.amenityRepository.find();
        const existingSlugs = await this.placesRepository.find({ select: ['slug'] });
        const usedSlugs = new Set(existingSlugs.map((p) => p.slug).filter((s): s is string => !!s));
        const districtIdCache = new Map<string, string | null>();

        let imported = 0;
        let skipped = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const row of rows) {
            try {
                const googlePlaceId = extractGooglePlaceId(row.mapsUrl);
                if (googlePlaceId) {
                    const existing = await this.placesRepository.findOne({ where: { googlePlaceId } });
                    if (existing) { skipped++; continue; }
                }

                const districtName = DISTRICT_ALIASES[row.district || ''] || row.district || '';
                const districtCacheKey = [row.department, row.province, districtName].filter(Boolean).join('|');
                if (!districtIdCache.has(districtCacheKey)) {
                    const where: Record<string, string> = {};
                    if (districtName) where.district = districtName;
                    if (row.department) where.department = row.department.trim();
                    if (row.province) where.province = row.province.trim();
                    const ubigeo = Object.keys(where).length
                        ? await this.ubigeoRepository.findOne({ where })
                        : null;
                    districtIdCache.set(districtCacheKey, ubigeo?.id ?? null);
                }

                let slug = slugify(`${row.name}-${districtName}`) || `restaurante-${Date.now()}`;
                let suffix = 2;
                while (usedSlugs.has(slug)) {
                    slug = `${slugify(`${row.name}-${districtName}`)}-${suffix++}`;
                }
                usedSlugs.add(slug);

                const lat = row.latitude != null && row.latitude !== '' ? parseFloat(String(row.latitude)) : null;
                const lng = row.longitude != null && row.longitude !== '' ? parseFloat(String(row.longitude)) : null;
                const reviewCount = row.reviewCount != null
                    ? parseInt(String(row.reviewCount).replace(/[.,]/g, ''), 10)
                    : 0;
                const googleRating = row.rating != null && row.rating !== ''
                    ? parseFloat(String(row.rating))
                    : null;
                const menuImageUrls = splitList(row.menuPhotos);

                const place = this.placesRepository.create({
                    name: row.name.trim(),
                    nameNormalized: normalize(row.name.trim()),
                    address: row.address?.trim() || null,
                    latitude: Number.isFinite(lat) ? lat : null,
                    longitude: Number.isFinite(lng) ? lng : null,
                    location: lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
                        ? { type: 'Point', coordinates: [lng, lat] }
                        : null,
                    districtId: districtIdCache.get(districtCacheKey) ?? null,
                    categoryId: this.pickCategoryId(row.category, categories),
                    amenities: this.pickAmenities(row.amenities, amenities),
                    coverImageUrl: row.imageUrl || null,
                    menuImageUrls: menuImageUrls.length ? menuImageUrls : null,
                    phone: row.phone?.trim() || null,
                    website: row.website?.trim() || null,
                    description: row.description?.trim() || null,
                    openHoursText: row.schedule?.trim() || null,
                    googlePlaceId,
                    googleRating: Number.isFinite(googleRating) ? googleRating : null,
                    googleTotalReviews: Number.isFinite(reviewCount) ? reviewCount : 0,
                    slug,
                    status: 'active',
                    isVerified: false,
                    countryCode: 'PE',
                    metadata: {
                        source: 'google_maps_scrape',
                        scrapedCategory: row.category,
                        mapsFeatureId: row.mapsFeatureId,
                        importedAt: new Date().toISOString(),
                    },
                });

                const saved = await this.placesRepository.save(place);

                const photoUrls = splitList(row.photos);
                if (photoUrls.length) {
                    await this.placePhotosRepository.save(
                        photoUrls.map((url) => this.placePhotosRepository.create({ url, placeId: saved.id, userId: adminUserId })),
                    );
                }

                const videoUrls = splitList(row.videos);
                if (videoUrls.length) {
                    await this.placeVideosRepository.save(
                        videoUrls.map((url) => this.placeVideosRepository.create({ url, placeId: saved.id, userId: adminUserId })),
                    );
                }

                imported++;
            } catch (err) {
                failed++;
                errors.push(`"${row.name}": ${(err as Error).message}`);
            }
        }

        return {
            imported,
            skipped,
            failed,
            errors,
        };
    }

    /**
     * Importa reseñas de Google Maps a la tabla google_reviews.
     * Idempotente: usa .orIgnore() sobre el índice único (placeId, authorName, time).
     * Solo inserta si el Place ya existe en la BD (matcheado por googlePlaceId).
     */
    async importGoogleReviews(rows: ImportScrapedReviewDto[]) {
        // 1. Map googlePlaceId → placeId (UUID) in batch
        const placeIds = [...new Set(rows.map(r => r.googlePlaceId).filter(Boolean))];
        const places = await this.placesRepository
            .createQueryBuilder('place')
            .select(['place.id', 'place.googlePlaceId'])
            .where('place.googlePlaceId IN (:...placeIds)', { placeIds })
            .getMany();
        const placeMap = new Map(places.map(p => [p.googlePlaceId, p.id]));

        let imported = 0;
        let skipped = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const row of rows) {
            try {
                const placeId = placeMap.get(row.googlePlaceId);
                if (!placeId) {
                    skipped++;
                    continue;
                }

                await this.googleReviewsRepository
                    .createQueryBuilder()
                    .insert()
                    .into(GoogleReview)
                    .values({
                        placeId,
                        authorName: row.reviewer,
                        authorPhotoUrl: row.authorPhotoUrl || null,
                        rating: row.rating,
                        text: row.text || null,
                        relativeTimeDescription: row.date || null,
                        time: row.time || null,
                    })
                    .orIgnore()
                    .execute();
                imported++;
            } catch (err) {
                failed++;
                errors.push(`"${row.reviewer}@${row.googlePlaceId}": ${(err as Error).message}`);
            }
        }

        return {
            imported,
            skipped,
            failed,
            errors,
            total: rows.length,
        };
    }

    // ── CRM COMERCIAL — oportunidades ────────────────────────────────────────

    // Restaurantes ya en la plataforma pero sin reclamar, rankeados por
    // actividad real (check-ins pesan más que favoritos, que pesan más que
    // reseñas) — para que el equipo sepa a quién contactar primero sin adivinar.
    async getOpportunities(status?: string): Promise<any[]> {
        const query = this.placesRepository.createQueryBuilder('place')
            .leftJoinAndSelect('place.district', 'district')
            .leftJoin(Checkin, 'checkin', 'checkin.placeId = place.id')
            .leftJoin(FavoritePlace, 'favorite', 'favorite.placeId = place.id')
            .leftJoin(User, 'salesUser', 'salesUser.id = place.assignedSalesUserId')
            .addSelect('salesUser.fullName', 'assignedSalesUserName')
            .addSelect('COUNT(DISTINCT checkin.id)', 'checkinsCount')
            .addSelect('COUNT(DISTINCT favorite.id)', 'favoritesCount')
            .where('place.claimedByUserId IS NULL')
            .andWhere('place.status = :status', { status: 'active' });

        if (status) {
            query.andWhere('place.commercialStatus = :commercialStatus', { commercialStatus: status });
        }

        query.groupBy('place.id').addGroupBy('district.id').addGroupBy('salesUser.id');

        const raw = await query.getRawAndEntities();
        return raw.entities
            .map((place, i) => {
                const row = raw.raw[i];
                const checkinsCount = parseInt(row.checkinsCount || 0, 10);
                const favoritesCount = parseInt(row.favoritesCount || 0, 10);
                const score = checkinsCount * 3 + favoritesCount * 2 + (place.totalReviews || 0);
                return { ...place, checkinsCount, favoritesCount, score, assignedSalesUserName: row.assignedSalesUserName ?? null };
            })
            .sort((a, b) => b.score - a.score);
    }

    async updateOpportunityStatus(placeId: string, status: string): Promise<void> {
        const place = await this.placesRepository.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');
        place.commercialStatus = status as any;
        await this.placesRepository.save(place);
    }

    async listSalesUsers() {
        const users = await this.usersRepository.find({ where: { role: 'sales' }, order: { fullName: 'ASC' } });
        return users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email }));
    }

    // Solo el admin reasigna; las suscripciones ya creadas conservan su comercial (congelado en subscriptions.sales_user_id).
    async assignSalesUser(placeId: string, salesUserId: string | null) {
        const place = await this.placesRepository.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (salesUserId) {
            const user = await this.usersRepository.findOne({ where: { id: salesUserId } });
            if (user?.role !== 'sales') throw new BadRequestException('El usuario elegido no es comercial');
        }
        await this.placesRepository.update(placeId, {
            assignedSalesUserId: salesUserId,
            salesAssignedAt: salesUserId ? new Date() : null,
        });
        return { message: salesUserId ? 'Comercial asignado' : 'Local liberado' };
    }

    async getWuarikesHereRequests(status?: string): Promise<WuarikesHereRequest[]> {
        return this.wuarikesHereRepository.find({
            where: status ? { status: status as any } : {},
            relations: ['requestedBy'],
            order: { createdAt: 'DESC' },
        });
    }

    async updateWuarikesHereRequestStatus(id: string, status: string): Promise<void> {
        const request = await this.wuarikesHereRepository.findOne({ where: { id } });
        if (!request) throw new NotFoundException('Solicitud no encontrada');
        request.status = status as any;
        await this.wuarikesHereRepository.save(request);
    }

    private pickCategoryId(rawCategory: string | undefined, categories: Category[]): string | null {
        const norm = normalize(rawCategory || '');
        if (!norm) return null;

        // Match exacto contra el nombre real de la categoria (lo que ofrece el dropdown del Excel)
        const exact = categories.find((c) => normalize(c.name) === norm);
        if (exact) return exact.id;

        // Fallback best-effort para texto libre (ej. categoria cruda del scraper de Google)
        for (const [re, name] of CATEGORY_KEYWORDS) {
            if (re.test(norm)) {
                const cat = categories.find((c) => c.name === name);
                if (cat) return cat.id;
            }
        }
        return null;
    }

    // "WiFi, Estacionam., Yape/Plin" -> ids de Amenity que matcheen por nombre (match exacto o parcial)
    private pickAmenities(raw: string | undefined, amenities: Amenity[]): Amenity[] {
        const names = splitList(raw).map(normalize);
        if (!names.length) return [];
        const matched: Amenity[] = [];
        for (const wanted of names) {
            const amenity = amenities.find((a) => {
                const n = normalize(a.name);
                return n === wanted || n.includes(wanted) || wanted.includes(n);
            });
            if (amenity && !matched.some((m) => m.id === amenity.id)) matched.push(amenity);
        }
        return matched;
    }
}
