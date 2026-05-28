import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmailCampaignService } from './email-campaign.service';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Place } from '../places/entities/place.entity';

@ApiTags('email-campaigns')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('business/email-campaigns')
export class EmailCampaignController {
    constructor(
        private readonly campaignService: EmailCampaignService,
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
    @ApiOperation({ summary: 'Create a new email campaign (DRAFT)' })
    async create(@Body() dto: CreateEmailCampaignDto, @CurrentUser() user: any) {
        await this.assertOwner(dto.placeId, user.id);
        return await this.campaignService.create(dto);
    }

    @Get('place/:placeId')
    @ApiOperation({ summary: 'Get all email campaigns for a place' })
    async findByPlace(@Param('placeId') placeId: string, @CurrentUser() user: any) {
        await this.assertOwner(placeId, user.id);
        return await this.campaignService.findByPlace(placeId);
    }

    @Get(':campaignId')
    @ApiOperation({ summary: 'Get a single email campaign' })
    async findOne(@Param('campaignId') campaignId: string) {
        return await this.campaignService.findOne(campaignId);
    }

    @Post(':campaignId/send')
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ summary: 'Trigger sending an email campaign' })
    async triggerSend(@Param('campaignId') campaignId: string) {
        return await this.campaignService.triggerSend(campaignId);
    }
}
