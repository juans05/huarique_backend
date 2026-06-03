import {
    Controller,
    Get,
    Param,
    Query,
    UseGuards,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { SocialAccount } from './entities/social-account.entity';
import { SocialComment } from './entities/social-comment.entity';
import { Place } from '../places/entities/place.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('social-stats')
@Controller('business/places/:placeId/social/stats')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SocialStatsController {
    constructor(
        @InjectRepository(SocialAccount)
        private accountsRepo: Repository<SocialAccount>,
        @InjectRepository(SocialComment)
        private commentsRepo: Repository<SocialComment>,
        @InjectRepository(Place)
        private placesRepo: Repository<Place>,
    ) {}

    private async assertOwner(placeId: string, userId: string) {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
        return place;
    }

    @Get()
    @ApiOperation({ summary: 'Get aggregated social media stats for a place' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async getStats(@CurrentUser() user: any, @Param('placeId') placeId: string) {
        await this.assertOwner(placeId, user.id);
        // Cuentas activas
        const accounts = await this.accountsRepo.find({ where: { placeId, isActive: true } });
        const accountIds = accounts.map(a => a.id);

        if (accountIds.length === 0) {
            return {
                totalAccounts: 0,
                accounts: [],
                totalComments: 0,
                aiReplied: 0,
                manualReplied: 0,
                pendingReplies: 0,
                aiResponseRate: 0,
                sentimentBreakdown: { positive: 0, negative: 0, neutral: 0, question: 0 },
            };
        }

        // Contar comentarios totales
        const totalComments = await this.commentsRepo
            .createQueryBuilder('c')
            .where('c.social_account_id IN (:...ids)', { ids: accountIds })
            .getCount();

        // Contar respondidos por IA
        const aiReplied = await this.commentsRepo
            .createQueryBuilder('c')
            .where('c.social_account_id IN (:...ids)', { ids: accountIds })
            .andWhere('c.ai_reply IS NOT NULL')
            .getCount();

        // Contar respondidos manualmente
        const manualReplied = await this.commentsRepo
            .createQueryBuilder('c')
            .where('c.social_account_id IN (:...ids)', { ids: accountIds })
            .andWhere('c.manual_reply IS NOT NULL')
            .getCount();

        // Sentimiento
        const sentimentRaw = await this.commentsRepo
            .createQueryBuilder('c')
            .select('c.sentiment', 'sentiment')
            .addSelect('COUNT(*)', 'count')
            .where('c.social_account_id IN (:...ids)', { ids: accountIds })
            .groupBy('c.sentiment')
            .getRawMany();

        const sentimentBreakdown: Record<string, number> = { positive: 0, negative: 0, neutral: 0, question: 0 };
        sentimentRaw.forEach(row => {
            if (row.sentiment) sentimentBreakdown[row.sentiment] = parseInt(row.count);
        });

        return {
            totalAccounts: accounts.length,
            accounts: accounts.map(a => ({
                id: a.id,
                username: a.platformUsername,
                platform: a.platform,
            })),
            totalComments,
            aiReplied,
            manualReplied,
            pendingReplies: totalComments - aiReplied - manualReplied,
            aiResponseRate: totalComments > 0 ? Math.round((aiReplied / totalComments) * 100) : 0,
            sentimentBreakdown,
        };
    }
}
