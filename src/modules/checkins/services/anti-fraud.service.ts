import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Checkin } from '../entities/checkin.entity';

interface AntiFraudValidation {
    isValid: boolean;
    error?: string;
    remainingTime?: number;
}

@Injectable()
export class AntiFraudService {
    constructor(
        @InjectRepository(Checkin)
        private checkinsRepository: Repository<Checkin>,
    ) { }

    /**
     * Validate check-in cooldown (4 hours per place)
     */
    async validateCooldown(userId: string, placeId: string): Promise<AntiFraudValidation> {
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

        const recentCheckin = await this.checkinsRepository.findOne({
            where: {
                userId,
                placeId,
            },
            order: {
                createdAt: 'DESC',
            },
        });

        if (recentCheckin && recentCheckin.createdAt > fourHoursAgo) {
            const timeSinceCheckin = Date.now() - recentCheckin.createdAt.getTime();
            const remainingTime = (4 * 60 * 60 * 1000) - timeSinceCheckin;

            return {
                isValid: false,
                error: 'COOLDOWN_ACTIVE',
                remainingTime: Math.ceil(remainingTime / 1000), // seconds
            };
        }

        return { isValid: true };
    }

    /**
     * Validate daily check-in limit (10 per day)
     */
    async validateDailyLimit(userId: string): Promise<AntiFraudValidation> {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const todayCheckins = await this.checkinsRepository.count({
            where: {
                userId,
            },
        });

        if (todayCheckins >= 10) {
            return {
                isValid: false,
                error: 'DAILY_LIMIT_REACHED',
            };
        }

        return { isValid: true };
    }

    /**
     * Detect suspicious speed between check-ins
     * Flags if user moved > 50 km/h between check-ins
     */
    async validateSpeed(
        userId: string,
        newLat: number,
        newLng: number,
    ): Promise<{ suspicious: boolean; speed?: number }> {
        const lastCheckin = await this.checkinsRepository
            .createQueryBuilder('checkin')
            .leftJoinAndSelect('checkin.place', 'place')
            .where('checkin.userId = :userId', { userId })
            .orderBy('checkin.createdAt', 'DESC')
            .limit(1)
            .getOne();

        if (!lastCheckin || !lastCheckin.place) {
            return { suspicious: false };
        }

        const distance = this.calculateDistance(
            Number(lastCheckin.place.latitude),
            Number(lastCheckin.place.longitude),
            newLat,
            newLng,
        );

        const timeDiff = (Date.now() - lastCheckin.createdAt.getTime()) / (1000 * 60 * 60); // hours
        const speed = distance / timeDiff; // km/h

        if (speed > 50) {
            return {
                suspicious: true,
                speed: Math.round(speed),
            };
        }

        return { suspicious: false };
    }

    /**
     * Calculate distance between two points (Haversine formula)
     */
    private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) *
            Math.cos(this.toRad(lat2)) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private toRad(degrees: number): number {
        return degrees * (Math.PI / 180);
    }
}
