import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { MissionsService } from './missions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';

@ApiTags('Missions')
@ApiBearerAuth()
@Controller('missions')
@UseGuards(JwtAuthGuard)
export class MissionsController {
    constructor(private readonly missionsService: MissionsService) { }

    @Get('daily')
    @ApiOperation({ summary: 'Get daily missions for current user' })
    @ApiResponse({ status: 200, description: 'Return list of daily missions and progress.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async getDailyMissions(@Request() req) {
        const missions = await this.missionsService.getDailyMissions(req.user.id);

        const completed = missions.filter(m => m.status === 'completed').length;
        const total = missions.length;

        return {
            missions,
            dailyProgress: {
                completed,
                total,
            },
        };
    }

    @Post(':id/claim')
    @ApiOperation({ summary: 'Claim reward for a completed mission' })
    @ApiParam({ name: 'id', description: 'Mission UUID' })
    @ApiResponse({ status: 200, description: 'Reward claimed successfully.' })
    @ApiResponse({ status: 400, description: 'Mission not completed or already claimed.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async claimReward(@Request() req, @Param('id') missionId: string) {
        return this.missionsService.claimMissionReward(req.user.id, missionId);
    }
}
