import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { User } from './entities/user.entity';
import { UserFollow } from './entities/user-follow.entity';
import { Place } from '../places/entities/place.entity';
import { PlaceResponseDto } from '../places/dto/place-response.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private usersRepository: Repository<User>,
        @InjectRepository(Place)
        private placesRepository: Repository<Place>,
        @InjectRepository(UserFollow)
        private followsRepository: Repository<UserFollow>,
    ) { }

    // ── SEGUIR USUARIOS ──────────────────────────────────────────────────────

    async follow(followerId: string, followingId: string): Promise<void> {
        if (followerId === followingId) {
            throw new BadRequestException('No puedes seguirte a ti mismo');
        }
        const target = await this.usersRepository.findOne({ where: { id: followingId } });
        if (!target) throw new NotFoundException('Usuario no encontrado');

        const existing = await this.followsRepository.findOne({ where: { followerId, followingId } });
        if (existing) throw new ConflictException('Ya sigues a este usuario');

        await this.followsRepository.save(this.followsRepository.create({ followerId, followingId }));
    }

    async unfollow(followerId: string, followingId: string): Promise<void> {
        const existing = await this.followsRepository.findOne({ where: { followerId, followingId } });
        if (!existing) throw new NotFoundException('No sigues a este usuario');
        await this.followsRepository.remove(existing);
    }

    async isFollowing(followerId: string, followingId: string): Promise<boolean> {
        const existing = await this.followsRepository.findOne({ where: { followerId, followingId } });
        return existing !== null;
    }

    async getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
        const [followers, following] = await Promise.all([
            this.followsRepository.count({ where: { followingId: userId } }),
            this.followsRepository.count({ where: { followerId: userId } }),
        ]);
        return { followers, following };
    }

    async getFollowingIds(userId: string): Promise<string[]> {
        const rows = await this.followsRepository.find({ where: { followerId: userId } });
        return rows.map((r) => r.followingId);
    }

    async getPublicProfile(userId: string, viewerId?: string): Promise<{
        id: string;
        fullName: string;
        avatarUrl: string | null;
        currentLevel: number;
        followers: number;
        following: number;
    }> {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        // Mismo 404 tanto si no existe como si es privado y no eres tú — no le
        // regalamos a un extraño la información de que la cuenta sí existe
        // pero está oculta.
        if (!user || (!user.isProfilePublic && viewerId !== userId)) {
            throw new NotFoundException('Usuario no encontrado');
        }

        const counts = await this.getFollowCounts(userId);
        return {
            id: user.id,
            fullName: user.fullName,
            avatarUrl: user.avatarUrl,
            currentLevel: user.currentLevel ?? 1,
            ...counts,
        };
    }

    async create(
        email: string,
        password: string,
        fullName: string,
        isVerified = false,
        verificationCode?: string,
        socialProvider?: string,
        socialId?: string,
    ): Promise<User> {
        // If social login, password might be randomized or empty not handled here?
        // Assuming this create is reused for both registration paths.
        const passwordHash = await bcrypt.hash(password, 10);
        const user = this.usersRepository.create({
            email,
            passwordHash,
            fullName,
            isVerified,
            verificationCode,
            // default expiry 10 mins if code present
            verificationCodeExpiresAt: verificationCode ? new Date(Date.now() + 10 * 60 * 1000) : null,
            socialProvider,
            socialId,
        });
        return this.usersRepository.save(user);
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.usersRepository.findOne({ where: { email } });
    }

    async findBySocialId(provider: string, socialId: string): Promise<User | null> {
        return this.usersRepository.findOne({ where: { socialProvider: provider, socialId } });
    }

    async linkSocialAccount(userId: string, provider: string, socialId: string): Promise<void> {
        await this.usersRepository.update(userId, { socialProvider: provider, socialId });
    }

    async findById(id: string): Promise<User> {
        const user = await this.usersRepository.findOne({ where: { id } });
        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }
        return user;
    }

    async validatePassword(user: User, password: string): Promise<boolean> {
        if (!user.passwordHash) return false;

        // Migración automática de contraseñas legacy en texto plano
        if (!user.passwordHash.startsWith('$2a$') && !user.passwordHash.startsWith('$2b$')) {
            if (user.passwordHash === password) {
                const newHash = await bcrypt.hash(password, 10);
                await this.usersRepository.update(user.id, { passwordHash: newHash });
                user.passwordHash = newHash;
                return true;
            }
            return false;
        }

        return bcrypt.compare(password, user.passwordHash);
    }

    async updateLastLogin(userId: string): Promise<void> {
        await this.usersRepository.update(userId, { lastLoginAt: new Date() });
    }

    async addPoints(userId: string, points: number): Promise<void> {
        await this.usersRepository.increment({ id: userId }, 'totalPoints', points);
    }

    async updateRole(userId: string, role: 'user' | 'admin' | 'business'): Promise<void> {
        await this.usersRepository.update(userId, { role });
    }

    async markVerified(userId: string): Promise<void> {
        await this.usersRepository.update(userId, {
            isVerified: true,
            verificationCode: null,
            verificationCodeExpiresAt: null,
        });
    }

    async updatePassword(userId: string, passwordHash: string): Promise<void> {
        await this.usersRepository.update(userId, {
            passwordHash,
            verificationCode: null,
            verificationCodeExpiresAt: null,
        });
    }

    async setVerificationCode(userId: string, code: string): Promise<void> {
        await this.usersRepository.update(userId, {
            verificationCode: code,
            verificationCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
        });
    }

    async updateFromSocial(userId: string, provider: string, socialId: string, avatarUrl?: string): Promise<void> {
        await this.usersRepository.update(userId, {
            socialProvider: provider,
            socialId: socialId,
            ...(avatarUrl ? { avatarUrl } : {}),
            isVerified: true // Social users are verified by default
        });
    }

    async getProfile(userId: string): Promise<any> {
        const user = await this.usersRepository
            .createQueryBuilder('user')
            .leftJoinAndSelect('user.badges', 'userBadge')
            .leftJoinAndSelect('userBadge.badge', 'badge')
            .where('user.id = :userId', { userId })
            .getOne();

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        // Get stats
        const stats = await this.getUserStats(userId);

        // Get followers and following counts
        const followersCount = await this.usersRepository.query(
            `SELECT COUNT(*) as count FROM wuarike_db.user_follows WHERE following_id = $1`,
            [userId],
        );

        const followingCount = await this.usersRepository.query(
            `SELECT COUNT(*) as count FROM wuarike_db.user_follows WHERE follower_id = $1`,
            [userId],
        );

        return {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            avatarUrl: user.avatarUrl,
            coverImageUrl: user.coverImageUrl,
            bio: user.bio,
            city: user.city,
            hometown: user.hometown,
            role: user.role,
            pronouns: user.pronouns,
            gender: user.gender,
            birthDate: user.birthDate,
            totalPoints: user.totalPoints,
            level: user.currentLevel,
            levelName: this.calculateLevel(user.totalPoints),
            xp: user.totalPoints,
            nextLevelXp: user.currentLevel * 1000,
            checkinsCount: stats.totalCheckins,
            reviewsCount: stats.totalCheckins,
            photosCount: stats.totalPhotos,
            videosCount: stats.totalVideos,
            followersCount: parseInt(String(followersCount[0]?.count || 0)),
            followingCount: parseInt(String(followingCount[0]?.count || 0)),
            memberSince: user.createdAt,
            isProfilePublic: user.isProfilePublic,
            areFavoritesPublic: user.areFavoritesPublic,
            allowBusinessMessages: user.allowBusinessMessages,
            isDiscoverable: user.isDiscoverable,
            stats,
            badges: user.badges.map((ub) => ({
                id: ub.badge.id,
                name: ub.badge.name,
                description: ub.badge.description,
                iconUrl: ub.badge.iconUrl,
                earnedAt: ub.earnedAt,
            })),
        };
    }

    private async getUserStats(userId: string): Promise<any> {
        const checkins = await this.usersRepository.query(
            `
      SELECT COUNT(*) as total_checkins,
             COUNT(DISTINCT place_id) as unique_places,
             SUM(likes_count) as total_likes_received
      FROM wuarike_db.checkins
      WHERE user_id = $1
    `,
            [userId],
        );

        const submissions = await this.usersRepository.query(
            `
      SELECT COUNT(*) as approved_submissions
      FROM wuarike_db.place_submissions
      WHERE submitted_by_user_id = $1 AND status = 'approved'
    `,
            [userId],
        );

        const districts = await this.usersRepository.query(
            `
      SELECT COUNT(DISTINCT p.district_id) as districts_visited
      FROM wuarike_db.checkins c
      JOIN wuarike_db.places p ON c.place_id = p.id
      WHERE c.user_id = $1
    `,
            [userId],
        );

        const photos = await this.usersRepository.query(
            `
      SELECT COUNT(*) as total_photos
      FROM wuarike_db.checkin_photos cp
      JOIN wuarike_db.checkins c ON cp.checkin_id = c.id
      WHERE c.user_id = $1
    `,
            [userId],
        );

        const videos = await this.usersRepository.query(
            `
      SELECT COUNT(*) as total_videos
      FROM wuarike_db.place_videos
      WHERE user_id = $1
    `,
            [userId],
        );

        return {
            totalCheckins: parseInt(checkins[0]?.total_checkins || 0),
            uniquePlaces: parseInt(checkins[0]?.unique_places || 0),
            totalLikesReceived: parseInt(checkins[0]?.total_likes_received || 0),
            placesSubmittedApproved: parseInt(submissions[0]?.approved_submissions || 0),
            districtsVisited: parseInt(districts[0]?.districts_visited || 0),
            totalPhotos: parseInt(photos[0]?.total_photos || 0),
            totalVideos: parseInt(videos[0]?.total_videos || 0),
        };
    }

    private calculateLevel(points: number): string {
        if (points < 50) return 'Explorador';
        if (points < 150) return 'Foodie';
        if (points < 300) return 'Conocedor';
        if (points < 500) return 'Influencer';
        return 'Leyenda';
    }

    async updateProfile(
        userId: string,
        updates: {
            fullName?: string;
            bio?: string;
            avatarUrl?: string;
            coverImageUrl?: string;
            city?: string;
            hometown?: string;
            pronouns?: string;
            gender?: string;
            birthDate?: string;
        },
    ): Promise<void> {
        const updateData: any = { ...updates };
        if (updates.birthDate) {
            updateData.birthDate = new Date(updates.birthDate);
        }

        await this.usersRepository.update(userId, updateData);
    }

    async updatePrivacy(
        userId: string,
        updates: {
            isProfilePublic?: boolean;
            areFavoritesPublic?: boolean;
            allowBusinessMessages?: boolean;
            isDiscoverable?: boolean;
        },
    ): Promise<void> {
        await this.usersRepository.update(userId, updates);
    }

    async getUserCheckins(userId: string, page: number = 1, limit: number = 12): Promise<any> {
        const skip = (page - 1) * limit;

        const [checkins, total] = await this.usersRepository.query(
            `
            SELECT
                c.id,
                c.comment,
                c.rating,
                c.photo_url as "photoUrl",
                c.likes_count as "likesCount",
                c.created_at as "createdAt",
                p.id as "placeId",
                p.name as "placeName",
                p.cover_image_url as "placePhotoUrl"
            FROM wuarike_db.checkins c
            JOIN wuarike_db.places p ON c.place_id = p.id
            WHERE c.user_id = $1
            ORDER BY c.created_at DESC
            LIMIT $2 OFFSET $3
            `,
            [userId, limit, skip],
        ).then(async (result) => {
            const countResult = await this.usersRepository.query(
                `SELECT COUNT(*) as count FROM wuarike_db.checkins WHERE user_id = $1`,
                [userId],
            );
            return [result, parseInt(countResult[0]?.count || 0)];
        });

        return {
            data: checkins.map((c: any) => ({
                id: c.id,
                comment: c.comment,
                rating: c.rating,
                photoUrl: c.photoUrl,
                likesCount: c.likesCount,
                createdAt: c.createdAt,
                place: {
                    id: c.placeId,
                    name: c.placeName,
                    photoUrl: c.placePhotoUrl,
                },
            })),
            total,
            page,
            limit,
        };
    }

    async getFollowers(userId: string, page: number = 1, limit: number = 20): Promise<any> {
        const skip = (page - 1) * limit;

        const [followers, total] = await this.usersRepository.query(
            `
            SELECT 
                u.id,
                u.full_name as "fullName",
                u.avatar_url as "avatarUrl",
                uf.created_at as "followedAt"
            FROM wuarike_db.user_follows uf
            JOIN wuarike_db.users u ON uf.follower_id = u.id
            WHERE uf.following_id = $1
            ORDER BY uf.created_at DESC
            LIMIT $2 OFFSET $3
            `,
            [userId, limit, skip],
        ).then(async (result) => {
            const countResult = await this.usersRepository.query(
                `SELECT COUNT(*) as count FROM wuarike_db.user_follows WHERE following_id = $1`,
                [userId],
            );
            return [result, parseInt(countResult[0]?.count || 0)];
        });

        return {
            data: followers,
            total,
            page,
            limit,
        };
    }

    async getFollowing(userId: string, page: number = 1, limit: number = 20): Promise<any> {
        const skip = (page - 1) * limit;

        const [following, total] = await this.usersRepository.query(
            `
            SELECT 
                u.id,
                u.full_name as "fullName",
                u.avatar_url as "avatarUrl",
                uf.created_at as "followedAt"
            FROM wuarike_db.user_follows uf
            JOIN wuarike_db.users u ON uf.following_id = u.id
            WHERE uf.follower_id = $1
            ORDER BY uf.created_at DESC
            LIMIT $2 OFFSET $3
            `,
            [userId, limit, skip],
        ).then(async (result) => {
            const countResult = await this.usersRepository.query(
                `SELECT COUNT(*) as count FROM wuarike_db.user_follows WHERE follower_id = $1`,
                [userId],
            );
            return [result, parseInt(countResult[0]?.count || 0)];
        });

        return {
            data: following,
            total,
            page,
            limit,
        };
    }

    async getFavorites(userId: string): Promise<any> {
        const favorites = await this.usersRepository.query(
            `
            SELECT place_id as "placeId", created_at as "savedAt"
            FROM wuarike_db.favorite_places
            WHERE user_id = $1
            ORDER BY created_at DESC
            `,
            [userId],
        );
        if (favorites.length === 0) {
            return { data: [], total: 0, page: 1, limit: 0 };
        }

        const savedAtByPlaceId = new Map<string, Date>(
            favorites.map((f: any) => [f.placeId, f.savedAt]),
        );

        const places = await this.placesRepository.find({
            where: { id: In([...savedAtByPlaceId.keys()]) },
            relations: ['category', 'district', 'tags', 'amenities'],
        });
        // Preserva el orden "más reciente primero" de favorite_places — find() con In() no lo garantiza.
        places.sort((a, b) => savedAtByPlaceId.get(b.id)!.valueOf() - savedAtByPlaceId.get(a.id)!.valueOf());

        return {
            data: plainToInstance(PlaceResponseDto, places, { excludeExtraneousValues: true }),
            total: places.length,
            page: 1,
            limit: places.length,
        };
    }
}
