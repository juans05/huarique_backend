import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamController } from './team.controller';
import { PlaceTeamService } from './place-team.service';
import { APP_GUARD } from '@nestjs/core';
import { PlaceTeamMember } from './entities/place-team-member.entity';
import { PlaceTeamProfile } from './entities/place-team-profile.entity';
import { PlaceModuleGuard } from './place-module.guard';
import { TeamMemberWhatsappAccess } from './entities/team-member-whatsapp-access.entity';
import { Place } from '../places/entities/place.entity';
import { PlaceRoleGuard } from '../../common/guards/place-role.guard';
import { UsersModule } from '../users/users.module';
import { CommonModule } from '../../common/common.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([PlaceTeamMember, PlaceTeamProfile, TeamMemberWhatsappAccess, Place]),
        UsersModule,
        CommonModule,
        SubscriptionsModule,
    ],
    controllers: [TeamController],
    providers: [PlaceTeamService, PlaceRoleGuard, { provide: APP_GUARD, useClass: PlaceModuleGuard }],
    exports: [PlaceTeamService, PlaceRoleGuard, TypeOrmModule],
})
export class TeamModule {}
