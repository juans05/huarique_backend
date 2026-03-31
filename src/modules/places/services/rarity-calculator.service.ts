import { Injectable } from '@nestjs/common';
import { Place } from '../../places/entities/place.entity';

@Injectable()
export class RarityCalculatorService {
    /**
     * Calculate rarity score for a place (0-100)
     * Based on: check-ins, unique visitors, age, and location
     */
    calculateRarityScore(place: Place, stats: {
        totalCheckins: number;
        uniqueVisitors: number;
        ageInDays: number;
    }): number {
        let score = 0;

        // Factor 1: Number of check-ins (40%)
        if (stats.totalCheckins < 10) score += 40;
        else if (stats.totalCheckins < 50) score += 30;
        else if (stats.totalCheckins < 200) score += 20;
        else score += 10;

        // Factor 2: Unique visitors (30%)
        if (stats.uniqueVisitors < 5) score += 30;
        else if (stats.uniqueVisitors < 20) score += 20;
        else if (stats.uniqueVisitors < 100) score += 10;

        // Factor 3: Age in app (20%)
        if (stats.ageInDays > 180) score += 20;
        else if (stats.ageInDays > 90) score += 15;
        else if (stats.ageInDays > 30) score += 10;

        // Factor 4: Remote location (10%)
        const remoteDistricts = ['Lurin', 'Lurín', 'Pachacamac', 'Pucusana', 'Villa El Salvador'];
        if (place.district && remoteDistricts.includes(place.district.district)) {
            score += 10;
        }

        return Math.min(score, 100);
    }

    /**
     * Determine rarity tier based on score
     */
    getRarityTier(score: number): string {
        if (score >= 80) return 'LEGENDARIO';
        if (score >= 60) return 'ÉPICO';
        if (score >= 40) return 'RARO';
        return 'COMÚN';
    }

    /**
     * Calculate age of place in days
     */
    calculateAgeInDays(createdAt: Date): number {
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - createdAt.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
}
