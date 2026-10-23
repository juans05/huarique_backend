import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PayoutsService } from './payouts.service';
import { AdminCommissionDto } from './dto/order-settings.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

class GeneratePayoutsDto { @Matches(/^\d{4}-\d{2}$/) period: string }
class PayPayoutDto { @IsString() @MaxLength(120) reference: string }

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@RequirePermission('liquidaciones.gestionar')
@Controller('admin/order-payouts')
export class AdminPayoutsController {
    constructor(private payouts: PayoutsService) { }

    @Get()
    list(@Query('period') period?: string) {
        return this.payouts.list(period);
    }

    @Post('generate')
    generate(@Body() dto: GeneratePayoutsDto) {
        return this.payouts.generate(dto.period);
    }

    @Post(':id/pay')
    pay(@Param('id') id: string, @Body() dto: PayPayoutDto) {
        return this.payouts.markPaid(id, dto.reference);
    }

    @Patch('commission/:placeId')
    commission(@Param('placeId') placeId: string, @Body() dto: AdminCommissionDto) {
        return this.payouts.setCommission(placeId, dto.wuarikesCommissionPct);
    }
}
