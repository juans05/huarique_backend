import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Badge } from './entities/badge.entity';
import { UserBadge } from './entities/user-badge.entity';
import { UserPointsLog } from './entities/user-points-log.entity';
import { UserStreak } from './entities/user-streak.entity';

@Injectable()
export class GamificationService {
    private readonly logger = new Logger(GamificationService.name);

    constructor(
        @InjectRepository(Badge)
        private badgesRepository: Repository<Badge>,
        @InjectRepository(UserBadge)
        private userBadgesRepository: Repository<UserBadge>,
        @InjectRepository(UserPointsLog)
        private pointsLogRepository: Repository<UserPointsLog>,
        @InjectRepository(UserStreak)
        private streaksRepository: Repository<UserStreak>,
    ) { }

    // Llamar en cada check-in — el schema no tenía nada actualizando esta tabla.
    async updateStreak(userId: string): Promise<UserStreak> {
        const today = new Date().toISOString().slice(0, 10);
        let streak = await this.streaksRepository.findOne({ where: { userId } });

        if (!streak) {
            streak = this.streaksRepository.create({ userId, currentStreak: 1, longestStreak: 1, lastCheckinDate: today as any });
            return this.streaksRepository.save(streak);
        }

        const lastDate = streak.lastCheckinDate ? new Date(streak.lastCheckinDate).toISOString().slice(0, 10) : null;
        if (lastDate === today) {
            return streak; // ya hizo check-in hoy, la racha no cambia
        }

        const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
        streak.currentStreak = lastDate === yesterday ? streak.currentStreak + 1 : 1;
        streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
        streak.lastCheckinDate = today as any;
        return this.streaksRepository.save(streak);
    }

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
                case 'checkins': // nombre usado por el seed original de badges
                    if (stats.totalCheckins >= (criteria.threshold ?? criteria.count)) isEligible = true;
                    break;
                case 'place_approved':
                    if (stats.approvedSubmissions >= (criteria.threshold ?? criteria.count)) isEligible = true;
                    break;
                case 'likes_received':
                    if (stats.totalLikesReceived >= (criteria.threshold ?? criteria.count)) isEligible = true;
                    break;
                case 'districts_visited':
                    if (stats.districtsVisited >= (criteria.threshold ?? criteria.count)) isEligible = true;
                    break;
                case 'checkins_in_one_district':
                    if (stats.maxCheckinsInOneDistrict >= (criteria.threshold ?? criteria.count)) isEligible = true;
                    break;
                case 'streak':
                    if (stats.currentStreak >= (criteria.threshold ?? criteria.count)) isEligible = true;
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

    async getLeaderboard(district?: string): Promise<any[]> {
        if (!district) {
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

        // Ranking por distrito: no hay XP por distrito, así que se ordena por
        // cantidad de check-ins en ese distrito — es la señal directa de
        // "top wuarikero de San Miguel", no la XP global del usuario.
        const rows = await this.pointsLogRepository.query(
            `SELECT u.full_name, u.current_level, COUNT(c.id) as checkins_in_district
       FROM checkins c
       JOIN users u ON u.id = c.user_id
       JOIN places p ON p.id = c.place_id
       JOIN ubigeos d ON d.id = p.district_id
       WHERE d.district = $1
       GROUP BY u.id, u.full_name, u.current_level
       ORDER BY checkins_in_district DESC
       LIMIT 10`,
            [district],
        );
        return rows.map((row: any) => ({
            username: row.full_name,
            level: parseInt(row.current_level ?? 1),
            checkins: parseInt(row.checkins_in_district ?? 0),
        }));
    }

    // Corre cada lunes a medianoche — le da el badge "Top de la Semana" a quien
    // más check-ins hizo en los últimos 7 días. Se otorga una sola vez por
    // usuario (igual que el resto de badges): si ya la tiene, ser top otra
    // semana no la vuelve a dar, queda como logro permanente.
    @Cron(CronExpression.EVERY_WEEK)
    async awardWeeklyTopBadge(): Promise<void> {
        const badge = await this.badgesRepository.findOne({ where: { name: 'Top de la Semana' } });
        if (!badge) {
            this.logger.warn('Badge "Top de la Semana" no existe todavía, saltando el cron semanal.');
            return;
        }

        const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
        const top = await this.pointsLogRepository.query(
            `SELECT user_id, COUNT(*) as total
       FROM checkins
       WHERE created_at >= $1
       GROUP BY user_id
       ORDER BY total DESC
       LIMIT 1`,
            [sevenDaysAgo],
        );

        const winnerId = top[0]?.user_id;
        if (!winnerId) return;

        const alreadyHas = await this.userBadgesRepository.findOne({ where: { userId: winnerId, badgeId: badge.id } });
        if (alreadyHas) return;

        await this.userBadgesRepository.save(this.userBadgesRepository.create({ userId: winnerId, badgeId: badge.id }));
        this.logger.log(`Badge "Top de la Semana" otorgado a ${winnerId}`);
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
            `SELECT COUNT(DISTINCT p.district_id) as districts_visited
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

        const maxDistrict = await this.pointsLogRepository.query(
            `SELECT COUNT(*) as total
       FROM checkins c
       JOIN places p ON c.place_id = p.id
       WHERE c.user_id = $1 AND p.district_id IS NOT NULL
       GROUP BY p.district_id
       ORDER BY total DESC
       LIMIT 1`,
            [userId],
        );

        const streak = await this.streaksRepository.findOne({ where: { userId } });

        return {
            totalCheckins: parseInt(checkins[0]?.total_checkins || 0),
            approvedSubmissions: parseInt(submissions[0]?.approved_submissions || 0),
            totalLikesReceived: parseInt(likes[0]?.total_likes_received || 0),
            districtsVisited: parseInt(districts[0]?.districts_visited || 0),
            totalPhotos: parseInt(photos[0]?.total_photos || 0),
            totalVideos: parseInt(videos[0]?.total_videos || 0),
            maxCheckinsInOneDistrict: parseInt(maxDistrict[0]?.total || 0),
            currentStreak: streak?.currentStreak || 0,
        };
    }
}
