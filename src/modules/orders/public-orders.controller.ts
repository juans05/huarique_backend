import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, Req, Sse } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { In, Repository } from 'typeorm';
import { Observable, from, switchMap } from 'rxjs';
import { PlaceTable } from './entities/place-table.entity';
import { Tab } from './entities/tab.entity';
import { Place } from '../places/entities/place.entity';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { OrderEventsService, StreamMessage } from './order-events.service';
import { CreateTableOrderDto, PaymentIntentDto, PaymentTokenDto, VerifyTablePinDto } from './dto/orders.dto';

const WEBHOOK_COOLDOWN_MS = 30_000;

// Con `trust proxy` = 1 (main.ts), req.ip ya es la IP real del cliente detrás del proxy de Railway.
function clientIp(req: any): string {
    return req?.ip || 'desconocido';
}

@Controller('public')
export class PublicOrdersController {
    private readonly lastWebhookAt = new Map<string, number>();

    constructor(
        @InjectRepository(PlaceTable) private tablesRepo: Repository<PlaceTable>,
        @InjectRepository(Tab) private tabsRepo: Repository<Tab>,
        @InjectRepository(Place) private placesRepo: Repository<Place>,
        private orders: OrdersService,
        private payments: PaymentsService,
        private events: OrderEventsService,
    ) { }

    @Get('tables/:qrToken')
    async table(@Param('qrToken') qrToken: string) {
        const table = await this.tablesRepo.findOne({ where: { qrToken, active: true } });
        if (!table) throw new NotFoundException('Mesa no encontrada');
        const [place, settings] = await Promise.all([
            this.placesRepo.findOne({ where: { id: table.placeId } }),
            this.orders.getSettings(table.placeId),
        ]);
        // La cuenta de la mesa solo se entrega tras validar el PIN (POST tables/:qrToken/verify-pin).
        return {
            place: { id: table.placeId, name: place?.name ?? '' },
            table: { name: table.name },
            ordering: { enabled: settings.ordersEnabled, tablePaymentMode: settings.tablePaymentMode, cashPaymentEnabled: settings.cashPaymentEnabled },
            pinRequired: true,
        };
    }

    @Post('tables/:qrToken/verify-pin')
    @HttpCode(200)
    @Throttle({ default: { ttl: 60000, limit: 10 } })
    async verifyPin(@Param('qrToken') qrToken: string, @Body() dto: VerifyTablePinDto, @Req() req: any) {
        const table = await this.tablesRepo.findOne({ where: { qrToken, active: true } });
        if (!table) throw new NotFoundException('Mesa no encontrada');
        this.orders.assertTablePin(table, dto.pin, clientIp(req));
        const liveTab = await this.tabsRepo.findOne({ where: { tableId: table.id, status: In(['ABIERTA', 'CUENTA_PEDIDA']) } });
        return { ok: true, liveTabToken: liveTab?.publicToken ?? null };
    }

    @Post('orders')
    @Throttle({ default: { ttl: 60000, limit: 10 } })
    async createOrder(@Body() dto: CreateTableOrderDto, @Req() req: any) {
        const { order, tab, requiresPayment } = await this.orders.createTableOrder(dto.qrToken, dto, clientIp(req));
        return { orderToken: order.publicToken, tabToken: tab?.publicToken ?? null, requiresPayment, total: order.total };
    }

    @Get('orders/:token')
    order(@Param('token') token: string) {
        return this.orders.getPublicOrder(token);
    }

    @Get('tabs/:token')
    tab(@Param('token') token: string) {
        return this.orders.getPublicTab(token);
    }

    @Post('tabs/:token/request-bill')
    requestBill(@Param('token') token: string) {
        return this.orders.requestBill(token);
    }

    // Solo tokens que existen (pedido o cuenta) y con límite: si no, cualquiera podría abrir conexiones
    // de larga duración ilimitadas con textos inventados.
    @Sse('stream/:token')
    @Throttle({ default: { ttl: 60000, limit: 20 } })
    stream(@Param('token') token: string): Observable<StreamMessage> {
        return from(this.orders.publicTokenExists(token)).pipe(
            switchMap((exists) => {
                if (!exists) throw new NotFoundException('Pedido no encontrado');
                return this.events.streamForToken(token);
            }),
        );
    }

    @Post('payments/intent')
    @Throttle({ default: { ttl: 60000, limit: 10 } })
    intent(@Body() dto: PaymentIntentDto) {
        return this.payments.startOnlinePayment({ orderToken: dto.orderToken, tabToken: dto.tabToken }, { email: dto.email, name: dto.name, phone: dto.phone });
    }

    @Post('payments/:paymentId/token')
    @Throttle({ default: { ttl: 60000, limit: 10 } })
    payWithToken(@Param('paymentId') paymentId: string, @Body() dto: PaymentTokenDto) {
        return this.payments.payWithToken(paymentId, dto.token);
    }

    @Get('payments/:paymentId')
    paymentStatus(@Param('paymentId') paymentId: string) {
        return this.payments.getStatus(paymentId);
    }

    // Público a propósito (CulqiPanel → Webhooks): no se confía en el cuerpo, solo dispara la conciliación.
    @Post('payments/culqi-webhook')
    @HttpCode(200)
    @Throttle({ default: { ttl: 60000, limit: 20 } })
    webhook(@Query('place') placeId?: string) {
        if (!placeId) throw new BadRequestException('Falta el parámetro place');
        // ponytail: enfriamiento en memoria por instancia; el cron de 5 min cubre lo que se salte.
        const now = Date.now();
        if (now - (this.lastWebhookAt.get(placeId) ?? 0) >= WEBHOOK_COOLDOWN_MS) {
            this.lastWebhookAt.set(placeId, now);
            this.payments.reconcilePending(placeId).catch(() => undefined);
        }
        return { received: true };
    }
}
