import { Controller, Post, Get, Patch, Param, Body, HttpCode, HttpStatus, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BroadcastService } from './broadcast.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Place } from '../places/entities/place.entity';

@UseGuards(JwtAuthGuard)
@Controller('business/broadcasts')
export class BroadcastController {
    constructor(
        private readonly broadcastService: BroadcastService,
        @InjectRepository(Place)
        private readonly placesRepository: Repository<Place>,
    ) {}

    private async assertOwner(placeId: string, userId: string) {
        const place = await this.placesRepository.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
        return place;
    }

    @Post()
    async createBroadcast(@Body() data: any, @CurrentUser() user: any) {
        await this.assertOwner(data.placeId, user.id);
        return await this.broadcastService.createBroadcast(data);
    }

    @Get('place/:placeId')
    async getBroadcasts(@Param('placeId') placeId: string, @CurrentUser() user: any) {
        await this.assertOwner(placeId, user.id);
        return await this.broadcastService.getBroadcastsByPlace(placeId);
    }

    @Get(':broadcastId')
    async getBroadcast(@Param('broadcastId') broadcastId: string) {
        return await this.broadcastService.getBroadcast(broadcastId);
    }

    @Post(':broadcastId/send')
    @HttpCode(HttpStatus.ACCEPTED)
    async sendBroadcast(@Param('broadcastId') broadcastId: string) {
        return await this.broadcastService.triggerBroadcast(broadcastId);
    }

    @Patch(':broadcastId/schedule')
    @HttpCode(HttpStatus.OK)
    async scheduleBroadcast(
        @Param('broadcastId') broadcastId: string,
        @Body() data: { scheduledAt: string },
    ) {
        return await this.broadcastService.scheduleBroadcast(broadcastId, data.scheduledAt);
    }

    @Post(':broadcastId/cancel')
    @HttpCode(HttpStatus.OK)
    async cancelBroadcast(@Param('broadcastId') broadcastId: string) {
        return await this.broadcastService.cancelBroadcast(broadcastId);
    }

    @Patch(':broadcastId')
    @HttpCode(HttpStatus.OK)
    async updateBroadcast(@Param('broadcastId') broadcastId: string, @Body() data: any) {
        return await this.broadcastService.updateBroadcast(broadcastId, data);
    }
}
