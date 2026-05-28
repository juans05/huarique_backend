import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmailCampaignService } from './email-campaign.service';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('email-campaigns')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('business/email-campaigns')
export class EmailCampaignController {
    constructor(private readonly campaignService: EmailCampaignService) {}

    @Post()
    @ApiOperation({ summary: 'Create a new email campaign (DRAFT)' })
    async create(@Body() dto: CreateEmailCampaignDto) {
        return await this.campaignService.create(dto);
    }

    @Get('place/:placeId')
    @ApiOperation({ summary: 'Get all email campaigns for a place' })
    async findByPlace(@Param('placeId') placeId: string) {
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
