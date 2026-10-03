import { BadRequestException, Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompleteSignupDto, MetaConnectService } from './meta-connect.service';

@UseGuards(JwtAuthGuard)
@Controller('business/whatsapp/connect')
export class MetaConnectController {
    constructor(private readonly metaConnect: MetaConnectService) {}

    /** Datos para abrir "Conectar con Facebook" en el navegador (appId y configuración de Embedded Signup). */
    @Get('config')
    getConfig() {
        return this.metaConnect.config();
    }

    /** ¿El local activó la conexión directa con Facebook? */
    @Get('channel')
    getChannel(@CurrentUser() user: any, @Query('placeId') placeId: string) {
        if (!placeId) throw new BadRequestException('placeId es requerido');
        return this.metaConnect.getChannel(user.id, placeId);
    }

    /** Checkbox del panel: activa o desactiva Facebook para el local (PlazBot sigue intacto). */
    @Patch('channel')
    setChannel(@CurrentUser() user: any, @Body() body: { placeId?: string; metaEnabled?: boolean }) {
        if (!body?.placeId || typeof body.metaEnabled !== 'boolean') throw new BadRequestException('placeId y metaEnabled son requeridos');
        return this.metaConnect.setChannel(user.id, body.placeId, body.metaEnabled);
    }

    /** Se llama cuando el dueño termina el flujo de Facebook: canjea el código, suscribe la app y guarda el número. */
    @Post('complete')
    complete(@CurrentUser() user: any, @Body() body: Partial<CompleteSignupDto>) {
        const { placeId, code, wabaId, phoneNumberId } = body ?? {};
        if (!placeId || !code || !wabaId || !phoneNumberId) {
            throw new BadRequestException('placeId, code, wabaId y phoneNumberId son requeridos');
        }
        return this.metaConnect.complete(user.id, { placeId, code, wabaId, phoneNumberId });
    }
}
