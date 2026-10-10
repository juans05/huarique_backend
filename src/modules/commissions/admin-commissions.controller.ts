import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommissionsService } from './commissions.service';

@ApiTags('admin-commissions')
@ApiBearerAuth()
@Controller('admin/commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCommissionsController {
    constructor(private readonly commissions: CommissionsService) {}

    @Get('settings')
    getSettings() {
        return this.commissions.getSettings();
    }

    @Patch('settings')
    updateSettings(@Body() body: any, @CurrentUser() user: any) {
        return this.commissions.updateSettings(body, user.id);
    }

    @Post('payouts')
    generate(@Body('period') period: string) {
        return this.commissions.generatePayouts(period);
    }

    @Get('payouts')
    list(@Query('period') period?: string) {
        return this.commissions.listPayouts({ period });
    }

    @Get('payouts/:id')
    detail(@Param('id') id: string) {
        return this.commissions.getPayout(id);
    }

    @Patch('payouts/:id/pay')
    pay(@Param('id') id: string, @Body('note') note: string | undefined, @CurrentUser() user: any) {
        return this.commissions.markPaid(id, user.id, note);
    }

    @Delete('payouts/:id')
    async cancel(@Param('id') id: string) {
        await this.commissions.cancelPayout(id);
        return { message: 'Liquidación anulada' };
    }
}
