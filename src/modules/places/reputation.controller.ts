import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaceRoleGuard } from '../../common/guards/place-role.guard';
import { RequiresPlaceRole } from '../../common/decorators/requires-place-role.decorator';
import { ReputationService } from './services/reputation.service';
import { SeoService } from './services/seo.service';

@ApiTags('reputacion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlaceRoleGuard)
@Controller('business/places/:placeId/reputacion')
export class ReputationController {
    constructor(
        private readonly reputation: ReputationService,
        private readonly seo: SeoService,
    ) {}

    @Get('cuota')
    @RequiresPlaceRole('agente')
    quota(@Param('placeId') placeId: string) {
        return this.reputation.aiQuota(placeId);
    }

    @Get('respuestas')
    @RequiresPlaceRole('agente')
    replies(@Param('placeId') placeId: string) {
        return this.reputation.listReplies(placeId);
    }

    @Post('respuestas/:replyId/cancelar')
    @RequiresPlaceRole('admin')
    async cancel(@Param('placeId') placeId: string, @Param('replyId') replyId: string) {
        await this.reputation.cancel(placeId, replyId);
        return { message: 'Respuesta cancelada' };
    }

    @Post('responder-antiguas')
    @RequiresPlaceRole('admin')
    bulk(@Param('placeId') placeId: string, @Body() body: { stars?: number[]; max?: number }) {
        return this.reputation.enqueueBulk(placeId, body ?? {});
    }

    @Get('seo')
    @RequiresPlaceRole('agente')
    seoScore(@Param('placeId') placeId: string) {
        return this.seo.get(placeId);
    }

    @Post('seo/recalcular')
    @RequiresPlaceRole('admin')
    recalc(@Param('placeId') placeId: string) {
        return this.seo.recalculate(placeId);
    }
}
