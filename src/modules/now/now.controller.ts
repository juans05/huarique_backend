import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Put,
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
import { NowFeedDto, NowPageDto } from './dto/now-feed.dto';
import { ReactNowDto, ReportNowDto } from './dto/react-now.dto';

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

    // Las rutas fijas (feed, mine, friends) van antes de las que llevan :id. Sin @Throttle propio: rige solo el
    // global, porque la IP móvil (CGNAT) la comparten muchos usuarios.
    @Get('feed')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Feed de Ahora: following, nearby (5 km de lat/lng) o friends. Respeta la visibilidad' })
    feed(@CurrentUser() user: { id: string }, @Query() query: NowFeedDto) {
        return this.nowService.feed(user.id, query);
    }

    @Get('mine')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Mis publicaciones, vigentes y vencidas, las más nuevas primero' })
    mine(@CurrentUser() user: { id: string }, @Query() query: NowPageDto) {
        return this.nowService.mine(user.id, query.page);
    }

    @Get('friends')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Mi lista de amigos de Ahora (id, nombre y foto)' })
    friends(@CurrentUser() user: { id: string }) {
        return this.nowService.listFriends(user.id);
    }

    @Post('friends/:userId')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Agregar a mi lista de amigos a alguien que me sigue (400 si no me sigue)' })
    addFriend(@CurrentUser() user: { id: string }, @Param('userId', ParseUUIDPipe) userId: string) {
        return this.nowService.addFriend(user.id, userId);
    }

    @Delete('friends/:userId')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Quitar de mi lista de amigos' })
    removeFriend(@CurrentUser() user: { id: string }, @Param('userId', ParseUUIDPipe) userId: string) {
        return this.nowService.removeFriend(user.id, userId);
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

    @Put('posts/:id/reaction')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Dar 👍, 👎 o ✅ (reemplaza la anterior). El ✅ pide el GPS y estar a 300 m o menos' })
    // Solo un respaldo por IP: así quienes comparten IP móvil (CGNAT) no chocan con el global de 30/min.
    @Throttle({ default: { ttl: 60_000, limit: 120 } })
    react(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReactNowDto) {
        return this.nowService.react(user.id, id, dto);
    }

    @Delete('posts/:id/reaction')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Quitar mi reacción' })
    // Solo un respaldo por IP: así quienes comparten IP móvil (CGNAT) no chocan con el global de 30/min.
    @Throttle({ default: { ttl: 60_000, limit: 120 } })
    unreact(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string) {
        return this.nowService.unreact(user.id, id);
    }

    @Post('posts/:id/report')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Reportar una publicación (1 por usuario y publicación, 20 por día)' })
    // Por IP es solo un respaldo: la IP móvil (CGNAT) la comparten muchos usuarios. La regla real, 20 por día
    // por usuario, está en NowService.report.
    @Throttle({ default: { ttl: 86_400_000, limit: 200 } })
    report(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportNowDto) {
        return this.nowService.report(user.id, id, dto.reason);
    }
}
