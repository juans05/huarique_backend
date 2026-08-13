import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaceTeamService } from '../team/place-team.service';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('business/reports')
export class ReportsController {
    constructor(
        private readonly reportsService: ReportsService,
        private readonly placeTeamService: PlaceTeamService,
    ) {}

    @Get('place/:placeId')
    @ApiOperation({ summary: 'Get the conversations/contacts analytics report for a place' })
    async getReport(
        @Param('placeId') placeId: string,
        @Query('from') from: string | undefined,
        @Query('to') to: string | undefined,
        @Query('statuses') statuses: string | undefined,
        @Query('agentId') agentId: string | undefined,
        @CurrentUser() user: any,
    ) {
        await this.placeTeamService.assertAccess(user.id, placeId, 'ia_total');
        const statusList = statuses?.split(',').filter(Boolean) as ('attended' | 'unassigned' | 'pending' | 'resolved')[] | undefined;
        return await this.reportsService.getReport(placeId, from, to, statusList, agentId);
    }
}
