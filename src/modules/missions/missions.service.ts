import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Mission } from '../gamification/entities/mission.entity';
import { UserMission } from '../gamification/entities/user-mission.entity';

@Injectable()
export class MissionsService {
    constructor(
        @InjectRepository(Mission)
        private missionsRepository: Repository<Mission>,
        @InjectRepository(UserMission)
        private userMissionsRepository: Repository<UserMission>,
    ) { }

    /**
     * Get daily missions for a user
     */
    async getDailyMissions(userId: string): Promise<any[]> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Get active daily missions
        const missions = await this.missionsRepository.find({
            where: {
                type: 'daily',
                isActive: true,
            },
        });

        // Get user progress for these missions
        const userMissions = await this.userMissionsRepository.find({
            where: {
                userId,
                expiresAt: LessThan(tomorrow),
            },
            relations: ['mission'],
        });

        // Create user missions if they don't exist
        const result = [];
        for (const mission of missions) {
            let userMission = userMissions.find(um => um.missionId === mission.id);

            if (!userMission) {
                userMission = this.userMissionsRepository.create({
                    userId,
                    missionId: mission.id,
                    progress: 0,
                    target: mission.criteria.target,
                    status: 'active',
                    expiresAt: tomorrow,
                });
                await this.userMissionsRepository.save(userMission);
            }

            result.push({
                id: mission.id,
                name: mission.name,
                description: mission.description,
                type: mission.type,
                rewardXp: mission.rewardXp,
                iconUrl: mission.iconUrl,
                progress: {
                    current: userMission.progress,
                    target: userMission.target,
                },
                status: userMission.status,
                expiresAt: userMission.expiresAt,
            });
        }

        return result;
    }

    /**
     * Claim mission reward
     */
    async claimMissionReward(userId: string, missionId: string): Promise<any> {
        const userMission = await this.userMissionsRepository.findOne({
            where: {
                userId,
                missionId,
                status: 'completed',
            },
            relations: ['mission'],
        });

        if (!userMission) {
            throw new Error('Mission not found or not completed');
        }

        userMission.status = 'claimed';
        await this.userMissionsRepository.save(userMission);

        return {
            mission: {
                id: userMission.mission.id,
                name: userMission.mission.name,
                status: 'claimed',
            },
            reward: {
                xpEarned: userMission.mission.rewardXp,
            },
        };
    }

    /**
     * Update mission progress
     */
    async updateMissionProgress(
        userId: string,
        criteriaType: string,
        increment: number = 1,
    ): Promise<void> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Find active user missions with matching criteria
        const userMissions = await this.userMissionsRepository
            .createQueryBuilder('um')
            .leftJoinAndSelect('um.mission', 'mission')
            .where('um.userId = :userId', { userId })
            .andWhere('um.status = :status', { status: 'active' })
            .andWhere('um.expiresAt > :today', { today })
            .andWhere("mission.criteria->>'type' = :criteriaType", { criteriaType })
            .getMany();

        for (const userMission of userMissions) {
            userMission.progress += increment;

            if (userMission.progress >= userMission.target) {
                userMission.status = 'completed';
                userMission.completedAt = new Date();
            }

            await this.userMissionsRepository.save(userMission);
        }
    }
}
