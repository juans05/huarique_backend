import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { QrService } from './qr.service';
import { GenerateBatchDto } from './dto/generate-batch.dto';
import { AssignQrDto } from './dto/assign-qr.dto';
import { QrCodeStatus } from './entities/qr-code.entity';

@ApiTags('admin-qr')
@ApiBearerAuth()
@Controller('admin/qr-codes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class QrAdminController {
    constructor(private readonly qrService: QrService) { }

    @Get('stats')
    @ApiOperation({ summary: 'Contadores del Banco de QR y escaneos' })
    async stats() {
        return this.qrService.stats();
    }

    @Get()
    @ApiOperation({ summary: 'Listar QR (Banco de QR)' })
    @ApiQuery({ name: 'status', required: false, enum: QrCodeStatus })
    @ApiQuery({ name: 'search', required: false, description: 'Busca por código (ej. QR-000042)' })
    async findAll(@Query('status') status?: QrCodeStatus, @Query('search') search?: string) {
        return this.qrService.findAll(status, search);
    }

    @Post('batch')
    @ApiOperation({ summary: 'Generar un lote de QR nuevos, todos en estado AVAILABLE' })
    async generateBatch(@Body() dto: GenerateBatchDto) {
        return this.qrService.generateBatch(dto);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Detalle de un QR + historial de asignaciones' })
    async findOne(@Param('id') id: string) {
        return this.qrService.findOne(id);
    }

    @Post(':id/assign')
    @ApiOperation({ summary: 'Asignar un QR disponible a un local (existente o nuevo)' })
    async assign(@Param('id') id: string, @Body() dto: AssignQrDto, @CurrentUser() user: any) {
        return this.qrService.assign(id, dto, user.id);
    }

    @Post(':id/reassign')
    @ApiOperation({ summary: 'Reasignar un QR ya asignado a otro local' })
    async reassign(@Param('id') id: string, @Body() dto: AssignQrDto, @CurrentUser() user: any) {
        return this.qrService.reassign(id, dto, user.id);
    }

    @Post(':id/unassign')
    @ApiOperation({ summary: 'Desasignar un QR (vuelve a AVAILABLE)' })
    async unassign(@Param('id') id: string, @Body('reason') reason: string | undefined, @CurrentUser() user: any) {
        return this.qrService.unassign(id, user.id, reason);
    }

    @Patch(':id/suspend')
    @ApiOperation({ summary: 'Suspender un QR temporalmente (sin perder la asignación)' })
    async suspend(@Param('id') id: string) {
        return this.qrService.setStatus(id, QrCodeStatus.SUSPENDED);
    }

    @Patch(':id/disable')
    @ApiOperation({ summary: 'Desactivar un QR definitivamente' })
    async disable(@Param('id') id: string) {
        return this.qrService.setStatus(id, QrCodeStatus.DISABLED);
    }

    @Patch(':id/activate')
    @ApiOperation({ summary: 'Reactivar un QR suspendido (vuelve a ASSIGNED o AVAILABLE según corresponda)' })
    async activate(@Param('id') id: string) {
        return this.qrService.activate(id);
    }
}
