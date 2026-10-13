import {
    Controller,
    Get,
    Post,
    HttpCode,
    HttpStatus,
    UseGuards,
    Query,
    Body,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BuyHardwareDto } from './dto/buy-hardware.dto';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

// Las rutas para suscribirse/ver/cancelar el plan de UNA sede viven en
// business-places.controller.ts (business/places/:id/subscription/*) — la
// suscripción es de la sede, no de la persona que llama.
@Controller('subscriptions')
export class SubscriptionsController {
    constructor(private readonly service: SubscriptionsService) { }

    @Get('plans')
    getPlans() {
        return this.service.getPlans();
    }

    @Get('hardware')
    getHardwareProducts() {
        return this.service.getHardwareProducts();
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('business', 'admin')
    @Post('hardware/checkout')
    buyHardware(@CurrentUser() user: any, @Body() dto: BuyHardwareDto) {
        const { token, productId, quantity, ...shipping } = dto;
        return this.service.buyHardware(user.id, user.email, token, productId, quantity, shipping);
    }

    // Webhook de Culqi (CulqiPanel → Eventos → Webhook). Público a propósito: no se confía en el
    // contenido, solo dispara una consulta a Culqi. Responde 200 al toque para que Culqi no reintente.
    @Post('webhook')
    @HttpCode(HttpStatus.OK)
    culqiWebhook() {
        this.service.handleCulqiWebhook();
        return { received: true };
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Get('admin/all')
    getAllSubscriptions(
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        return this.service.getAllSubscriptions(+page, +limit);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Get('admin/stats')
    getStats() {
        return this.service.getRevenueStats();
    }
}
