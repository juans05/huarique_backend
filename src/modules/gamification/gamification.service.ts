import { Injectable } from '@nestjs/common';
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

        return {
            totalCheckins: parseInt(checkins[0]?.total_checkins || 0),
            approvedSubmissions: parseInt(submissions[0]?.approved_submissions || 0),
            totalLikesReceived: parseInt(likes[0]?.total_likes_received || 0),
            districtsVisited: parseInt(districts[0]?.districts_visited || 0),
        };
    }
}
