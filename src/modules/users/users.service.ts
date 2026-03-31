import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private usersRepository: Repository<User>,
    ) { }

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

    async findById(id: string): Promise<User> {
        const user = await this.usersRepository.findOne({ where: { id } });
        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }
        return user;
    }

    async validatePassword(user: User, password: string): Promise<boolean> {
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

    async setVerificationCode(userId: string, code: string): Promise<void> {
        await this.usersRepository.update(userId, {
            verificationCode: code,
            verificationCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
        });
    }

    async updateFromSocial(userId: string, provider: string, socialId: string, avatarUrl?: string): Promise<void> {
        const updates: any = { socialProvider: provider, socialIdSocial: socialId };
        if (avatarUrl) updates.avatarUrl = avatarUrl;
        // Fix socialId mapping error if any
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
            bio: user.bio,
            pronouns: user.pronouns,
            gender: user.gender,
            birthDate: user.birthDate,
            totalPoints: user.totalPoints,
            level: this.calculateLevel(user.totalPoints),
            followersCount: parseInt(String(followersCount[0]?.count || 0)),
            followingCount: parseInt(String(followingCount[0]?.count || 0)),
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

        return {
            totalCheckins: parseInt(checkins[0]?.total_checkins || 0),
            uniquePlaces: parseInt(checkins[0]?.unique_places || 0),
            totalLikesReceived: parseInt(checkins[0]?.total_likes_received || 0),
            placesSubmittedApproved: parseInt(submissions[0]?.approved_submissions || 0),
            districtsVisited: parseInt(districts[0]?.districts_visited || 0),
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
            pronouns?: string;
            gender?: string;
            birthDate?: string;
        },
    ): Promise<void> {
        console.log('🔵 [Service] updateProfile llamado');
        console.log('🔵 [Service] User ID:', userId);
        console.log('🔵 [Service] Updates recibidos:', JSON.stringify(updates, null, 2));

        // Si birthDate viene como string ISO, convertir a Date
        const updateData: any = { ...updates };
        if (updates.birthDate) {
            console.log('🔵 [Service] Convirtiendo birthDate de string a Date');
            console.log('   - birthDate original:', updates.birthDate);
            updateData.birthDate = new Date(updates.birthDate);
            console.log('   - birthDate convertida:', updateData.birthDate);
        }

        console.log('🔵 [Service] Datos finales para actualizar:', JSON.stringify(updateData, null, 2));
        console.log('🔵 [Service] Llamando a usersRepository.update...');

        await this.usersRepository.update(userId, updateData);

        console.log('✅ [Service] Usuario actualizado exitosamente en BD');
    }

    async getUserCheckins(userId: string, page: number = 1, limit: number = 12): Promise<any> {
        const skip = (page - 1) * limit;

        const [checkins, total] = await this.usersRepository.query(
            `
            SELECT 
                c.id,
                c.comment,
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
            SELECT 
                fp.id,
                fp.created_at as "savedAt",
                p.id as "placeId",
                p.name as "placeName",
                p.cover_image_url as "placePhotoUrl",
                p.rating as "placeRating"
            FROM wuarike_db.favorite_places fp
            JOIN wuarike_db.places p ON fp.place_id = p.id
            WHERE fp.user_id = $1
            ORDER BY fp.created_at DESC
            `,
            [userId],
        );

        return {
            data: favorites.map((f: any) => ({
                id: f.id,
                savedAt: f.savedAt,
                place: {
                    id: f.placeId,
                    name: f.placeName,
                    photoUrl: f.placePhotoUrl,
                    rating: f.placeRating,
                },
            })),
            total: favorites.length,
        };
    }
}
