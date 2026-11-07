import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NowService } from './now.service';
import { NowAreaDto } from './dto/now-area.dto';
import { CreateNowPostDto } from './dto/create-now-post.dto';

@ApiTags('now')
@Controller('now')
export class NowController {
    constructor(private readonly nowService: NowService) {}

    @Get()
    @UseGuards(OptionalJwtAuthGuard)
    @ApiOperation({ summary: 'Publicaciones y promos de locales con plan dentro de la zona del mapa' })
    list(@CurrentUser() user: { id: string } | null, @Query() area: NowAreaDto) {
        return this.nowService.listArea(user?.id ?? null, area);
    }

    @Get('posts/:id')
    @UseGuards(OptionalJwtAuthGuard)
    @ApiOperation({ summary: 'Una publicación (404 si venció, está oculta o no es visible para ti)' })
    findOne(@CurrentUser() user: { id: string } | null, @Param('id', ParseUUIDPipe) id: string) {
        return this.nowService.findOne(id, user?.id ?? null);
    }

    @Post('posts')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Publicar en Ahora (foto, video o texto) con la ubicación del GPS' })
    // Por IP es solo un respaldo: la IP móvil (CGNAT) la comparten muchos usuarios. La regla real, 5 por hora
    // por usuario, está en NowService.create.
    @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
    // 20 MB: el mayor de los dos tipos; NowService revisa tipo y tamaño según `kind`.
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
    create(@CurrentUser() user: { id: string }, @Body() dto: CreateNowPostDto, @UploadedFile() file?: Express.Multer.File) {
        return this.nowService.create(user.id, dto, file);
    }
}
