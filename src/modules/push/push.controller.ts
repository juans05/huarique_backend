import { BadRequestException, Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PushService } from './push.service';

const EXPO_TOKEN = /^ExponentPushToken\[[^\]]{1,180}\]$/;

export class RegisterDeviceDto {
    @Matches(EXPO_TOKEN, { message: 'Token de notificaciones inválido' }) token: string;
    @IsOptional() @IsIn(['android']) platform?: 'android';
}

/** La app del barbero registra su celular para recibir push. */
@Controller('business/push/devices')
export class PushController {
    constructor(private push: PushService) { }

    @Post()
    @UseGuards(JwtAuthGuard)
    @HttpCode(204)
    async register(@CurrentUser() user: any, @Body() dto: RegisterDeviceDto) {
        await this.push.register(user.id, dto.token, dto.platform);
    }

    /**
     * Sin sesión a propósito: al cerrar sesión sin internet o con la sesión vencida, la app reintenta la baja después.
     * El token solo lo tiene ese celular y borrarlo solo deja de mandarle avisos.
     */
    @Delete(':token')
    @HttpCode(204)
    @Throttle({ default: { ttl: 60000, limit: 20 } })
    async unregister(@Param('token') token: string) {
        if (!EXPO_TOKEN.test(token)) throw new BadRequestException('Token de notificaciones inválido');
        await this.push.unregister(token);
    }
}
