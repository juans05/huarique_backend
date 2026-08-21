import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Badge } from './entities/badge.entity';
import { UserBadge } from './entities/user-badge.entity';
import { UserPointsLog } from './entities/user-points-log.entity';

@Injectable()
export class GamificationService {
    constructor(
        @InjectRepository(Badge)
        private badgesRepository: Repository<Badge>,
        @InjectRepository(UserBadge)
        private userBadgesRepository: Repository<UserBadge>,
        @InjectRepository(UserPointsLog)
        private pointsLogRepository: Repository<UserPointsLog>,
    ) { }

    async logPoints(
        userId: string,
        points: number,
        reason: string,
        referenceId?: string,
    ): Promise<void> {
        const log = this.pointsLogRepository.create({
            userId,
            points,
            reason,
            referenceId,
        });
        await this.pointsLogRepository.save(log);

        // Check for badges after earning points or performing action
        await this.checkAndAwardBadges(userId);
    }

    async checkAndAwardBadges(userId: string): Promise<UserBadge[]> {
        const allBadges = await this.badgesRepository.find();
        const myBadges = await this.userBadgesRepository.find({
            where: { userId },
        });
        const myBadgeIds = new Set(myBadges.map((ub) => ub.badgeId));

        const newlyEarned: UserBadge[] = [];

        // Get user activity stats for evaluation
        const stats = await this.getUserActivityStats(userId);

        for (const badge of allBadges) {
            if (myBadgeIds.has(badge.id)) continue;

            const criteria = badge.criteria;
            if (!criteria) continue;

            let isEligible = false;

            switch (criteria.type) {
                case 'checkins_count':
                    if (stats.totalCheckins >= criteria.threshold) isEligible = true;
                    break;
                case 'place_approved':
                    if (stats.approvedSubmissions >= criteria.threshold) isEligible = true;
                    break;
                case 'likes_received':
                    if (stats.totalLikesReceived >= criteria.threshold) isEligible = true;
                    break;
                case 'districts_visited':
                    if (stats.districtsVisited >= criteria.threshold) isEligible = true;
                    break;
            }

            if (isEligible) {
                const userBadge = this.userBadgesRepository.create({
                    userId,
                    badgeId: badge.id,
                });
                const saved = await this.userBadgesRepository.save(userBadge);
                newlyEarned.push(saved);
            }
        }

        return newlyEarned;
    }

    async findAllBadges(): Promise<Badge[]> {
        return this.badgesRepository.find();
    }

    async getMyStats(userId: string): Promise<any> {
        const userResult = await this.pointsLogRepository.query(
            `SELECT current_level, total_points FROM users WHERE id = $1`,
            [userId],
        );
        const level = parseInt(userResult[0]?.current_level ?? 1);
        const xp = parseInt(userResult[0]?.total_points ?? 0);
        const nextLevelXp = level * 1000;
        const stats = await this.getUserActivityStats(userId);
        return {
            level,
            xp,
            nextLevelXp,
            checkinsCount: stats.totalCheckins,
            reviewsCount: stats.totalCheckins,
            photosCount: stats.totalPhotos,
            videosCount: stats.totalVideos,
        };
    }

    async getUserBadges(userId: string): Promise<any[]> {
        const allBadges = await this.badgesRepository.find();
        const myBadges = await this.userBadgesRepository.find({ where: { userId } });
        const myBadgeMap = new Map(myBadges.map((ub) => [ub.badgeId, ub]));
        return allBadges.map((badge) => ({
            id: badge.id,
            name: badge.name,
            icon: badge.iconUrl || '🏅',
            description: badge.description,
            unlockedAt: myBadgeMap.get(badge.id)?.earnedAt ?? null,
            progress: myBadgeMap.has(badge.id) ? 1 : 0,
            maxProgress: 1,
        }));
    }

    async getBadgeDetail(userId: string, badgeId: string): Promise<any> {
        const badge = await this.badgesRepository.findOne({ where: { id: badgeId } });
        if (!badge) throw new NotFoundException('Badge no encontrado');
        const userBadge = await this.userBadgesRepository.findOne({
            where: { userId, badgeId },
        });
        return {
            id: badge.id,
            name: badge.name,
            icon: badge.iconUrl || '🏅',
            description: badge.description,
            unlockedAt: userBadge?.earnedAt ?? null,
            progress: userBadge ? 1 : 0,
            maxProgress: 1,
        };
    }

    async getProfile(userId: string): Promise<any> {
        const userResult = await this.pointsLogRepository.query(
            `SELECT current_level, total_points FROM users WHERE id = $1`,
            [userId],
        );
        const currentLevel = parseInt(userResult[0]?.current_level ?? 1);
        const currentXp = parseInt(userResult[0]?.total_points ?? 0);
        const nextLevelXp = currentLevel * 1000;

        return {
            level: currentLevel,
            currentXp,
            nextLevelXp,
            progress: (currentXp / nextLevelXp) * 100,
            title: this.getTitleForLevel(currentLevel),
        };
    }

    async getLeaderboard(): Promise<any[]> {
        const rows = await this.pointsLogRepository.query(
            `SELECT full_name, current_level, total_points
       FROM users
       ORDER BY total_points DESC
       LIMIT 10`,
        );
        return rows.map((row: any) => ({
            username: row.full_name,
            level: parseInt(row.current_level ?? 1),
            xp: parseInt(row.total_points ?? 0),
        }));
    }

    private getTitleForLevel(level: number): string {
        if (level < 5) return 'Turista Gastronómico';
        if (level < 10) return 'Explorador de Sabores';
        if (level < 20) return 'Cazador de Wuarikes';
        return 'Leyenda Limeña';
    }

    private async getUserActivityStats(userId: string): Promise<any> {
        // This is a simplified version of stats
        const checkins = await this.pointsLogRepository.query(
            `SELECT COUNT(*) as total_checkins FROM checkins WHERE user_id = $1`,
            [userId],
        );

        const submissions = await this.pointsLogRepository.query(
            `SELECT COUNT(*) as approved_submissions FROM place_submissions WHERE submitted_by_user_id = $1 AND status = 'approved'`,
            [userId],
        );

        const likes = await this.pointsLogRepository.query(
            `SELECT SUM(likes_count) as total_likes_received FROM checkins WHERE user_id = $1`,
            [userId],
        );

        const districts = await this.pointsLogRepository.query(
            `SELECT COUNT(DISTINCT p.district) as districts_visited
       FROM checkins c
       JOIN places p ON c.place_id = p.id
       WHERE c.user_id = $1`,
            [userId],
        );

        const photos = await this.pointsLogRepository.query(
            `SELECT COUNT(*) as total_photos
       FROM checkin_photos cp
       JOIN checkins c ON cp.checkin_id = c.id
       WHERE c.user_id = $1`,
            [userId],
        );

        const videos = await this.pointsLogRepository.query(
            `SELECT COUNT(*) as total_videos FROM place_videos WHERE user_id = $1`,
            [userId],
        );

        return {
            totalCheckins: parseInt(checkins[0]?.total_checkins || 0),
            approvedSubmissions: parseInt(submissions[0]?.approved_submissions || 0),
            totalLikesReceived: parseInt(likes[0]?.total_likes_received || 0),
            districtsVisited: parseInt(districts[0]?.districts_visited || 0),
            totalPhotos: parseInt(photos[0]?.total_photos || 0),
            totalVideos: parseInt(videos[0]?.total_videos || 0),
        };
    }
}
