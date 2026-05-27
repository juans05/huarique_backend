import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { BroadcastService } from './broadcast.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('business/broadcasts')
export class BroadcastController {
    constructor(private readonly broadcastService: BroadcastService) {}

    // Create a new broadcast campaign
    @Post()
    async createBroadcast(@Body() data: any) {
        return await this.broadcastService.createBroadcast(data);
    }

    // Get all broadcasts for a place
    @Get('place/:placeId')
    async getBroadcasts(@Param('placeId') placeId: string) {
        return await this.broadcastService.getBroadcastsByPlace(placeId);
    }

    // Get single broadcast
    @Get(':broadcastId')
    async getBroadcast(@Param('broadcastId') broadcastId: string) {
        return await this.broadcastService.getBroadcast(broadcastId);
    }

    // Send/trigger a broadcast campaign
    @Post(':broadcastId/send')
    @HttpCode(HttpStatus.ACCEPTED)
    async sendBroadcast(@Param('broadcastId') broadcastId: string) {
        return await this.broadcastService.triggerBroadcast(broadcastId);
    }
}
