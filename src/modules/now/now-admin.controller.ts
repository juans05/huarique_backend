import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { NowService } from './now.service';
import { RestoreNowPostDto } from './dto/restore-now-post.dto';

/** Moderación de "Ahora" para el panel. Solo perfiles con locales.gestionar (Moderador y Administrador): es contenido de usuarios, no lo ven Comercial, Finanzas ni Soporte. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/now')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NowAdminController {
    constructor(private readonly nowService: NowService) {}

    @Get('reported')
    @RequirePermission('locales.gestionar')
    @ApiOperation({ summary: 'Publicaciones ocultas por votos o reportes, con el número de reportes y el motivo' })
    reported() {
        return this.nowService.reported();
    }

    @Patch('posts/:id')
    @RequirePermission('locales.gestionar')
    @ApiOperation({ summary: 'Restaurar una publicación ({ hidden: false }): vuelve a verse y se borran sus reportes' })
    // El body solo existe para validar que sea { hidden: false }; ocultar no se pide, ocurre solo.
    restore(@Param('id', ParseUUIDPipe) id: string, @Body() _dto: RestoreNowPostDto) {
        return this.nowService.restore(id);
    }

    @Delete('posts/:id')
    @RequirePermission('locales.gestionar')
    @ApiOperation({ summary: 'Borrar una publicación (sus reacciones y reportes se borran en cascada)' })
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.nowService.remove(id);
    }
}
