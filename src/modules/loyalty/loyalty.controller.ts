import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';
import { LoyaltyService } from './loyalty.service';

@ApiTags('loyalty')
@Controller('business/places/:placeId/loyalty')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LoyaltyController {
  constructor(
    private readonly loyaltyService: LoyaltyService,
    @InjectRepository(Place) private placesRepo: Repository<Place>,
  ) {}

  private async assertOwner(placeId: string, userId: string) {
    const place = await this.placesRepo.findOne({ where: { id: placeId } });
    if (!place || place.claimedByUserId !== userId) {
      throw new ForbiddenException('No tienes permiso');
    }
  }

  // ── PROGRAMA ──────────────────────────────────────────────────────────

  @Get('program')
  @ApiOperation({ summary: 'Get loyalty program config' })
  async getProgram(@Param('placeId') placeId: string, @CurrentUser() user: any) {
    await this.assertOwner(placeId, user.id);
    return this.loyaltyService.getProgram(placeId);
  }

  @Put('program')
  @ApiOperation({ summary: 'Create or update loyalty program' })
  async upsertProgram(@Param('placeId') placeId: string, @Body() data: any, @CurrentUser() user: any) {
    await this.assertOwner(placeId, user.id);
    return this.loyaltyService.upsertProgram(placeId, data);
  }

  // ── CRM — CLIENTES ───────────────────────────────────────────────────

  @Get('clients')
  @ApiOperation({ summary: 'List all loyalty card holders (CRM)' })
  async getClients(
    @Param('placeId') placeId: string,
    @Query('page') page = 1,
    @CurrentUser() user: any,
  ) {
    await this.assertOwner(placeId, user.id);
    return this.loyaltyService.getClients(placeId, +page);
  }

  @Get('clients/:cardId/transactions')
  @ApiOperation({ summary: 'Get transaction history for a loyalty card' })
  async getTransactions(@Param('placeId') placeId: string, @Param('cardId') cardId: string, @CurrentUser() user: any) {
    await this.assertOwner(placeId, user.id);
    return this.loyaltyService.getTransactions(cardId);
  }

  // ── PREMIOS ───────────────────────────────────────────────────────────

  @Get('rewards')
  @ApiOperation({ summary: 'List rewards for this place' })
  async getRewards(@Param('placeId') placeId: string, @CurrentUser() user: any) {
    await this.assertOwner(placeId, user.id);
    return this.loyaltyService.getRewards(placeId);
  }

  @Post('rewards')
  @ApiOperation({ summary: 'Create a new reward' })
  async createReward(@Param('placeId') placeId: string, @Body() data: any, @CurrentUser() user: any) {
    await this.assertOwner(placeId, user.id);
    return this.loyaltyService.upsertReward(placeId, null, data);
  }

  @Put('rewards/:rewardId')
  @ApiOperation({ summary: 'Update a reward' })
  async updateReward(@Param('placeId') placeId: string, @Param('rewardId') rewardId: string, @Body() data: any, @CurrentUser() user: any) {
    await this.assertOwner(placeId, user.id);
    return this.loyaltyService.upsertReward(placeId, rewardId, data);
  }

  @Delete('rewards/:rewardId')
  @ApiOperation({ summary: 'Deactivate a reward' })
  async deleteReward(@Param('placeId') placeId: string, @Param('rewardId') rewardId: string, @CurrentUser() user: any) {
    await this.assertOwner(placeId, user.id);
    await this.loyaltyService.deleteReward(rewardId);
    return { message: 'Premio eliminado' };
  }

  // ── CANJEAR PREMIO ────────────────────────────────────────────────────

  @Post('redeem')
  @ApiOperation({ summary: 'Redeem a reward for a customer (from cashier/restaurant side)' })
  async redeem(@Param('placeId') placeId: string, @Body() body: { cardId: string; rewardId: string }, @CurrentUser() user: any) {
    await this.assertOwner(placeId, user.id);
    return this.loyaltyService.redeem(body.cardId, body.rewardId);
  }
}
