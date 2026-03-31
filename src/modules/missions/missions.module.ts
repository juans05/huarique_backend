import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MissionsService } from './missions.service';
import { MissionsController } from './missions.controller';
import { Mission } from '../gamification/entities/mission.entity';
import { UserMission } from '../gamification/entities/user-mission.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Mission, UserMission])],
    controllers: [MissionsController],
    providers: [MissionsService],
    exports: [MissionsService],
})
export class MissionsModule { }
