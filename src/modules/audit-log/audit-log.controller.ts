import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('audit-logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('business/audit-logs')
export class AuditLogController {
    constructor(private readonly auditLogService: AuditLogService) {}

    @Get()
    @ApiOperation({ summary: 'Query audit logs with filters and pagination' })
    async findAll(@Query() query: QueryAuditLogDto) {
        return this.auditLogService.findAll(query);
    }
}
