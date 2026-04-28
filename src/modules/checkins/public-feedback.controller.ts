import {
    Controller,
    Post,
    Get,
    Patch,
    Body,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { PublicFeedback } from './entities/public-feedback.entity';
import { CreatePublicFeedbackDto } from './dto/create-public-feedback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginatedResponse } from '../../common/dto/pagination.dto';

@ApiTags('public')
@Controller()
export class PublicFeedbackController {
    constructor(
        @InjectRepository(PublicFeedback)
        private feedbackRepository: Repository<PublicFeedback>,
    ) {}

    // ──────────────────────────────────────────────────
    // PÚBLICO (sin JWT) — Para clientes que escanean NFC
    // ──────────────────────────────────────────────────

    @Post('public/feedback')
    @ApiOperation({ summary: 'Submit public feedback (from NFC scan, no auth required)' })
    @ApiResponse({ status: 201, description: 'Feedback saved privately.' })
    async submitFeedback(@Body() dto: CreatePublicFeedbackDto) {
        const feedback = this.feedbackRepository.create({
            placeId: dto.placeId,
            rating: dto.rating,
            comment: dto.comment || null,
            customerName: dto.customerName || null,
            customerContact: dto.customerContact || null,
            status: 'pending',
        });

        return this.feedbackRepository.save(feedback);
    }

    // ──────────────────────────────────────────────────
    // PRIVADO (con JWT) — Para dueños de restaurante
    // ──────────────────────────────────────────────────

    @Get('business/places/:id/complaints')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get private complaints intercepted by the smart filter' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'status', required: false, enum: ['pending', 'resolved', 'contacted'] })
    @ApiResponse({ status: 200, description: 'Paginated list of private feedback/complaints.' })
    async getComplaints(
        @Param('id') placeId: string,
        @Query('page') page = 1,
        @Query('status') status?: string,
    ): Promise<PaginatedResponse<PublicFeedback>> {
        const size = 20;
        const skip = (page - 1) * size;

        const where: any = { placeId };
        if (status) {
            where.status = status;
        }

        const [data, total] = await this.feedbackRepository.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip,
            take: size,
        });

        return {
            data,
            meta: {
                total,
                page,
                size,
                totalPages: Math.ceil(total / size),
            },
        };
    }

    @Patch('business/places/:id/complaints/:complaintId/resolve')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Mark a complaint as resolved' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    @ApiParam({ name: 'complaintId', description: 'Complaint UUID' })
    @ApiResponse({ status: 200, description: 'Complaint marked as resolved.' })
    async resolveComplaint(
        @Param('id') placeId: string,
        @Param('complaintId') complaintId: string,
    ) {
        await this.feedbackRepository.update(
            { id: complaintId, placeId },
            { status: 'resolved', resolvedAt: new Date() },
        );
        return { message: 'Queja marcada como resuelta' };
    }
}
