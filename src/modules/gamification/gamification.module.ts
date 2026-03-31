import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GamificationService } from './gamification.service';
import { Badge } from './entities/badge.entity';
import { UserBadge } from './entities/user-badge.entity';
import { UserPointsLog } from './entities/user-points-log.entity';
import { Mission } from './entities/mission.entity';
import { UserMission } from './entities/user-mission.entity';
import { UserStreak } from './entities/user-streak.entity';
import { XpCalculatorService } from './services/xp-calculator.service';

import { GamificationController } from './gamification.controller';

@Module({
    imports: [TypeOrmModule.forFeature([
        Badge,
        UserBadge,
        UserPointsLog,
        Mission,
        UserMission,
        UserStreak,
    ])],
    controllers: [GamificationController],
    providers: [GamificationService, XpCalculatorService],
    exports: [GamificationService, XpCalculatorService],
})
export class GamificationModule { }
