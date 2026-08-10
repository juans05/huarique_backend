import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamController } from './team.controller';
import { PlaceTeamService } from './place-team.service';
import { PlaceTeamMember } from './entities/place-team-member.entity';
import { TeamMemberWhatsappAccess } from './entities/team-member-whatsapp-access.entity';
import { Place } from '../places/entities/place.entity';
import { PlaceRoleGuard } from '../../common/guards/place-role.guard';
import { UsersModule } from '../users/users.module';
import { CommonModule } from '../../common/common.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([PlaceTeamMember, TeamMemberWhatsappAccess, Place]),
        UsersModule,
        CommonModule,
    ],
    controllers: [TeamController],
    providers: [PlaceTeamService, PlaceRoleGuard],
    exports: [PlaceTeamService, PlaceRoleGuard, TypeOrmModule],
})
export class TeamModule {}
