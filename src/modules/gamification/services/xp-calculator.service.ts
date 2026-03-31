import { Injectable } from '@nestjs/common';
import { Checkin } from '../../checkins/entities/checkin.entity';
import { Place } from '../../places/entities/place.entity';

@Injectable()
export class XpCalculatorService {
    /**
     * Calculate XP earned from a check-in
     */
    calculateXp(checkin: Checkin, place: Place, isFirstToday: boolean = false): number {
        let xp = 10; // Base XP

        // Bonus for photo
        if (checkin.photoUrl) {
            xp += 10;
        }

        // Bonus based on rarity
        switch (place.rarity) {
            case 'RARO':
                xp += 20;
                break;
            case 'ÉPICO':
                xp += 40;
                break;
            case 'LEGENDARIO':
                xp += 90;
                break;
        }

        // First check-in of the day bonus
        if (isFirstToday) {
            xp += 5;
        }

        return xp;
    }

    /**
     * Calculate user level based on total XP
     * Formula: level = floor(sqrt(totalXp / 50))
     */
    calculateLevel(totalXp: number): number {
        return Math.floor(Math.sqrt(totalXp / 50));
    }

    /**
     * Calculate XP required for next level
     */
    calculateXpForNextLevel(currentLevel: number): number {
        const nextLevel = currentLevel + 1;
        return 50 * nextLevel * nextLevel;
    }

    /**
     * Calculate XP remaining to next level
     */
    calculateXpToNextLevel(totalXp: number, currentLevel: number): number {
        const xpForNextLevel = this.calculateXpForNextLevel(currentLevel);
        return xpForNextLevel - totalXp;
    }

    /**
     * Check if user leveled up
     */
    checkLevelUp(oldXp: number, newXp: number): { leveledUp: boolean; newLevel: number } {
        const oldLevel = this.calculateLevel(oldXp);
        const newLevel = this.calculateLevel(newXp);

        return {
            leveledUp: newLevel > oldLevel,
            newLevel,
        };
    }
}
