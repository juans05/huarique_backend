import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { XpCalculatorService } from './services/xp-calculator.service';
import { GamificationService } from './gamification.service';

@ApiTags('Gamification')
@ApiBearerAuth()
@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
    constructor(
        private readonly xpService: XpCalculatorService,
        private readonly gamificationService: GamificationService,
    ) { }

    @Get('my-stats')
    @ApiOperation({ summary: 'Get current user gamification stats' })
    @ApiResponse({ status: 200, description: 'Returns level, XP, and activity counts.' })
    async getMyStats(@Request() req) {
        return this.gamificationService.getMyStats(req.user.id);
    }

    @Get('badges')
    @ApiOperation({ summary: 'Get all badges with user unlock status' })
    @ApiResponse({ status: 200, description: 'Returns badge list with unlock info.' })
    async getBadges(@Request() req) {
        return this.gamificationService.getUserBadges(req.user.id);
    }

    @Get('badges/:id')
    @ApiOperation({ summary: 'Get badge detail' })
    @ApiParam({ name: 'id', description: 'Badge UUID' })
    @ApiResponse({ status: 200, description: 'Returns badge detail with unlock info.' })
    async getBadgeDetail(@Request() req, @Param('id') id: string) {
        return this.gamificationService.getBadgeDetail(req.user.id, id);
    }

    @Get('profile')
    @ApiOperation({ summary: 'Get current user gamification profile' })
    @ApiResponse({ status: 200, description: 'Returns level, current XP, and next level progress.' })
    async getProfile(@Request() req) {
        return this.gamificationService.getProfile(req.user.id);
    }

    @Get('leaderboard')
    @ApiOperation({ summary: 'Get global leaderboard' })
    @ApiResponse({ status: 200, description: 'Returns top 10 users.' })
    async getLeaderboard() {
        return this.gamificationService.getLeaderboard();
    }
}
