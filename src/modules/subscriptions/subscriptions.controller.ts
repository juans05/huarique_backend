import {
    Controller,
    Get,
    UseGuards,
    Query,
} from '@nestjs/common';
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
