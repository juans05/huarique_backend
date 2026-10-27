import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PushService } from './push.service';

export class RegisterDeviceDto {
    @Matches(/^ExponentPushToken\[[^\]]{1,180}\]$/, { message: 'Token de notificaciones inválido' }) token: string;
    @IsOptional() @IsIn(['android']) platform?: 'android';
}

/** La app del barbero registra su celular para recibir push. */
@UseGuards(JwtAuthGuard)
@Controller('business/push/devices')
export class PushController {
    constructor(private push: PushService) { }

    @Post()
    @HttpCode(204)
    async register(@CurrentUser() user: any, @Body() dto: RegisterDeviceDto) {
        await this.push.register(user.id, dto.token, dto.platform);
    }

    @Delete(':token')
    @HttpCode(204)
    async unregister(@CurrentUser() user: any, @Param('token') token: string) {
        await this.push.unregister(user.id, token);
    }
}
