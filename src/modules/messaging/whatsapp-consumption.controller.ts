import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsNumber, Matches, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaceRoleGuard } from '../../common/guards/place-role.guard';
import { RequiresPlaceRole } from '../../common/decorators/requires-place-role.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { WhatsAppBillingService } from './whatsapp-billing.service';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const currentMonth = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 7);

export class MonthQueryDto {
    @Matches(MONTH, { message: 'Mes en formato AAAA-MM' }) month?: string;
}

export class RateDto {
    @Matches(/^[A-Z]{2,6}$/, { message: 'Mercado: código del rate card (PE, LATAM, OTHER, NA, MX…)' }) market: string;
    @IsIn(['marketing', 'utility', 'authentication', 'service']) category: string;
    @Matches(/^[A-Z]{3}$/, { message: 'Moneda de 3 letras (PEN, USD)' }) currency: string;
    @IsNumber() @Min(0) @Max(100) rate: number;
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha en formato AAAA-MM-DD' }) validFrom: string;
}

/** Consumo de WhatsApp del local: lo que Meta le cobra a su cuenta (estimado y oficial) y si le falta método de pago. */
@UseGuards(JwtAuthGuard, PlaceRoleGuard)
@Controller('business/places/:placeId/whatsapp')
export class WhatsAppConsumptionController {
    constructor(private readonly billing: WhatsAppBillingService) { }

    @Get('consumption')
    @RequiresPlaceRole('supervisor')
    consumption(@Param('placeId') placeId: string, @Query() q: MonthQueryDto) {
        return this.billing.consumption(placeId, q.month ?? currentMonth());
    }

    /** Solo el estado de pago: lo consultan la agenda y el chat para mostrar el aviso. */
    @Get('billing')
    @RequiresPlaceRole('agente')
    async billingStatus(@Param('placeId') placeId: string) {
        return { billing: await this.billing.billing(placeId) };
    }
}

/** Consumo de todos los locales y tarifas de Meta, para el equipo de Wuarikes. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/whatsapp-consumption')
export class AdminWhatsAppConsumptionController {
    constructor(private readonly billing: WhatsAppBillingService) { }

    @Get()
    @RequirePermission('whatsapp.gestionar')
    summary(@Query() q: MonthQueryDto) {
        return this.billing.platformSummary(q.month ?? currentMonth());
    }

    @Get('rates')
    @RequirePermission('whatsapp.gestionar', 'plataforma.config')
    rates() {
        return this.billing.listRates();
    }

    @Put('rates')
    @RequirePermission('plataforma.config')
    saveRate(@Body() dto: RateDto) {
        return this.billing.saveRate(dto);
    }
}
