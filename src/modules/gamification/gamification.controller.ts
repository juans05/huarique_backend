import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { XpCalculatorService } from './services/xp-calculator.service';

@ApiTags('Gamification')
@ApiBearerAuth()
@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
    constructor(
        private readonly xpService: XpCalculatorService,
    ) { }

    @Get('profile')
    @ApiOperation({ summary: 'Get current user gamification profile' })
    @ApiResponse({ status: 200, description: 'Returns level, current XP, and next level progress.' })
    async getProfile(@Request() req) {
        // En una implementación real, esto vendría de la BD. 
        // Por ahora calculamos basado en el usuario (que debe tener currentLevel y xp)
        // Como el req.user a veces viene incompleto del JWT, idealmente haríamos un lookup.

        // Mock response based on logic
        const currentXp = req.user.xp || 0;
        const currentLevel = req.user.currentLevel || 1;

        // Calcular cuánto falta para el siguiente nivel (lógica simple ejemplo)
        const nextLevelXp = currentLevel * 1000;

        return {
            level: currentLevel,
            currentXp,
            nextLevelXp,
            progress: (currentXp / nextLevelXp) * 100,
            title: this.getTitleForLevel(currentLevel)
        };
    }

    @Get('leaderboard')
    @ApiOperation({ summary: 'Get global leaderboard' })
    @ApiResponse({ status: 200, description: 'Returns top 10 users.' })
    async getLeaderboard() {
        // Mock response
        return [
            { username: 'ElReyDelCeviche', level: 15, xp: 14500 },
            { username: 'RutaGastronomica', level: 12, xp: 11200 },
            { username: 'ComiendoEnLima', level: 10, xp: 9500 },
        ];
    }

    private getTitleForLevel(level: number): string {
        if (level < 5) return 'Turista Gastronómico';
        if (level < 10) return 'Explorador de Sabores';
        if (level < 20) return 'Cazador de Wuarikes';
        return 'Leyenda Limeña';
    }
}
