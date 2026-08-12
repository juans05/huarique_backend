import { Controller, Post, Get, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmailCampaignService } from './email-campaign.service';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import { UpdateEmailCampaignDto } from './dto/update-email-campaign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaceTeamService } from '../team/place-team.service';

@ApiTags('email-campaigns')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('business/email-campaigns')
export class EmailCampaignController {
    constructor(
        private readonly campaignService: EmailCampaignService,
        private placeTeamService: PlaceTeamService,
    ) {}

    private async assertOwner(placeId: string, userId: string) {
        await this.placeTeamService.assertAccess(userId, placeId, 'ia_total');
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

    @Get('place/:placeId/audience-count')
    @ApiOperation({ summary: 'Get count of customers with marketing consent for a place' })
    async getAudienceCount(
        @Param('placeId') placeId: string,
        @Query('sources') sources: string,
        @CurrentUser() user: any,
    ) {
        await this.assertOwner(placeId, user.id);
        const parsed = sources?.split(',').filter(Boolean) as ('feedback' | 'contacts')[] | undefined;
        return await this.campaignService.getAudienceCount(placeId, parsed?.length ? parsed : ['feedback']);
    }

    @Get(':campaignId')
    @ApiOperation({ summary: 'Get a single email campaign' })
    async findOne(@Param('campaignId') campaignId: string, @CurrentUser() user: any) {
        const campaign = await this.campaignService.findOne(campaignId);
        await this.assertOwner(campaign.placeId, user.id);
        return campaign;
    }

    @Patch(':campaignId')
    @ApiOperation({ summary: 'Edit a DRAFT or SCHEDULED campaign (name, subject, body)' })
    async update(@Param('campaignId') campaignId: string, @Body() dto: UpdateEmailCampaignDto, @CurrentUser() user: any) {
        const campaign = await this.campaignService.findOne(campaignId);
        await this.assertOwner(campaign.placeId, user.id);
        return await this.campaignService.update(campaignId, dto);
    }

    @Delete(':campaignId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Delete a campaign (not allowed while SENDING)' })
    async remove(@Param('campaignId') campaignId: string, @CurrentUser() user: any) {
        const campaign = await this.campaignService.findOne(campaignId);
        await this.assertOwner(campaign.placeId, user.id);
        return await this.campaignService.remove(campaignId);
    }

    @Post(':campaignId/send')
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ summary: 'Trigger sending an email campaign' })
    async triggerSend(@Param('campaignId') campaignId: string, @CurrentUser() user: any) {
        const campaign = await this.campaignService.findOne(campaignId);
        await this.assertOwner(campaign.placeId, user.id);
        return await this.campaignService.triggerSend(campaignId);
    }

    @Patch(':campaignId/complete')
    @ApiOperation({ summary: 'Force-mark a stuck SENDING campaign as COMPLETED' })
    async forceComplete(@Param('campaignId') campaignId: string, @CurrentUser() user: any) {
        const campaign = await this.campaignService.findOne(campaignId);
        await this.assertOwner(campaign.placeId, user.id);
        return await this.campaignService.forceComplete(campaignId);
    }

    @Patch(':campaignId/schedule')
    @ApiOperation({ summary: 'Schedule a DRAFT campaign to send automatically in the future' })
    async scheduleCampaign(@Param('campaignId') campaignId: string, @Body() data: { scheduledAt: string }, @CurrentUser() user: any) {
        const campaign = await this.campaignService.findOne(campaignId);
        await this.assertOwner(campaign.placeId, user.id);
        return await this.campaignService.scheduleCampaign(campaignId, data.scheduledAt);
    }

    @Post(':campaignId/unschedule')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cancel a scheduled campaign, reverting it to DRAFT' })
    async unscheduleCampaign(@Param('campaignId') campaignId: string, @CurrentUser() user: any) {
        const campaign = await this.campaignService.findOne(campaignId);
        await this.assertOwner(campaign.placeId, user.id);
        return await this.campaignService.unscheduleCampaign(campaignId);
    }
}
