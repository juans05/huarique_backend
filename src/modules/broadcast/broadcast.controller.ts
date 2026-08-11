import { Controller, Post, Get, Patch, Param, Body, HttpCode, HttpStatus, UseGuards, NotFoundException } from '@nestjs/common';
import { BroadcastService } from './broadcast.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaceTeamService } from '../team/place-team.service';

@UseGuards(JwtAuthGuard)
@Controller('business/broadcasts')
export class BroadcastController {
    constructor(
        private readonly broadcastService: BroadcastService,
        private placeTeamService: PlaceTeamService,
    ) {}

    // Resuelve el broadcast y valida acceso a su sede en un solo paso — las rutas de
    // :broadcastId no tenían NINGÚN chequeo antes (ni siquiera de dueño).
    private async assertBroadcastAccess(broadcastId: string, userId: string) {
        const broadcast = await this.broadcastService.getBroadcast(broadcastId);
        if (!broadcast) throw new NotFoundException('Campaña no encontrada');
        await this.placeTeamService.assertAccess(userId, broadcast.placeId, 'ia_total');
        return broadcast;
    }

    @Post()
    async createBroadcast(@Body() data: any, @CurrentUser() user: any) {
        await this.placeTeamService.assertAccess(user.id, data.placeId, 'ia_total');
        return await this.broadcastService.createBroadcast(data);
    }

    @Get('place/:placeId')
    async getBroadcasts(@Param('placeId') placeId: string, @CurrentUser() user: any) {
        await this.placeTeamService.assertAccess(user.id, placeId, 'ia_total');
        return await this.broadcastService.getBroadcastsByPlace(placeId);
    }

    @Get(':broadcastId')
    async getBroadcast(@Param('broadcastId') broadcastId: string, @CurrentUser() user: any) {
        return await this.assertBroadcastAccess(broadcastId, user.id);
    }

    @Post(':broadcastId/send')
    @HttpCode(HttpStatus.ACCEPTED)
    async sendBroadcast(@Param('broadcastId') broadcastId: string, @CurrentUser() user: any) {
        await this.assertBroadcastAccess(broadcastId, user.id);
        return await this.broadcastService.triggerBroadcast(broadcastId);
    }

    @Patch(':broadcastId/schedule')
    @HttpCode(HttpStatus.OK)
    async scheduleBroadcast(
        @Param('broadcastId') broadcastId: string,
        @Body() data: { scheduledAt: string },
        @CurrentUser() user: any,
    ) {
        await this.assertBroadcastAccess(broadcastId, user.id);
        return await this.broadcastService.scheduleBroadcast(broadcastId, data.scheduledAt);
    }

    @Post(':broadcastId/cancel')
    @HttpCode(HttpStatus.OK)
    async cancelBroadcast(@Param('broadcastId') broadcastId: string, @CurrentUser() user: any) {
        await this.assertBroadcastAccess(broadcastId, user.id);
        return await this.broadcastService.cancelBroadcast(broadcastId);
    }

    @Patch(':broadcastId')
    @HttpCode(HttpStatus.OK)
    async updateBroadcast(@Param('broadcastId') broadcastId: string, @Body() data: any, @CurrentUser() user: any) {
        await this.assertBroadcastAccess(broadcastId, user.id);
        return await this.broadcastService.updateBroadcast(broadcastId, data);
    }
}
