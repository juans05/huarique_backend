import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ComplaintBookService } from './complaint-book.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';

@ApiTags('complaint-book')
@Controller('complaint-book')
export class ComplaintBookController {
    constructor(private readonly complaintBookService: ComplaintBookService) { }

    @Post()
    @HttpCode(201)
    @ApiOperation({ summary: 'Submit a Libro de Reclamaciones entry (public, no auth)' })
    @ApiResponse({ status: 201, description: 'Returns { folio }.' })
    async create(@Body() dto: CreateComplaintDto) {
        return this.complaintBookService.create(dto);
    }
}
