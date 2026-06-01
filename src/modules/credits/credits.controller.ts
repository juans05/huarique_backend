import { Controller, Get, Post, Body, Param, Query, UseGuards, HttpCode, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CreditsService } from './credits.service';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';

@ApiTags('credits')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('business/credits')
export class CreditsController {
    constructor(
        private readonly creditsService: CreditsService,
        @InjectRepository(Place)
        private readonly placesRepository: Repository<Place>,
    ) {}

    private async assertOwner(placeId: string, userId: string) {
        const place = await this.placesRepository.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
        return place;
    }

    @Get('balance')
    @ApiOperation({ summary: 'Get credit balance for a place' })
    @ApiQuery({ name: 'placeId', required: true })
    async getBalance(@Query('placeId') placeId: string, @CurrentUser() user: any) {
        await this.assertOwner(placeId, user.id);
        return this.creditsService.getBalance(placeId);
    }

    @Get('transactions')
    @ApiOperation({ summary: 'List credit transactions' })
    async getTransactions(@Query() query: QueryTransactionDto, @CurrentUser() user: any) {
        if (query.placeId) {
            await this.assertOwner(query.placeId, user.id);
        }
        return this.creditsService.getTransactions(query);
    }

    @Get('usage/monthly')
    @ApiOperation({ summary: 'Get monthly usage summary' })
    @ApiQuery({ name: 'placeId', required: true })
    @ApiQuery({ name: 'year', required: false })
    @ApiQuery({ name: 'month', required: false })
    async getMonthlyUsage(
        @Query('placeId') placeId: string,
        @Query('year') year: string,
        @Query('month') month: string,
        @CurrentUser() user: any,
    ) {
        await this.assertOwner(placeId, user.id);
        const now = new Date();
        const y = year ? parseInt(year) : now.getFullYear();
        const m = month ? parseInt(month) : now.getMonth() + 1;
        const total = await this.creditsService.getMonthlyUsage(placeId, y, m);
        return { placeId, year: y, month: m, totalMessages: total };
    }

    @Post('add')
    @ApiOperation({ summary: 'Add credits (purchase/bonus/refund)' })
    @HttpCode(200)
    async addCredits(
        @Body() data: { placeId: string; amount: number; type: 'purchase' | 'bonus' | 'refund'; description?: string },
        @CurrentUser() user: any,
    ) {
        await this.assertOwner(data.placeId, user.id);
        return this.creditsService.add(data.placeId, data.amount, data.type, data.description);
    }
}
