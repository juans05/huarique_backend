import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Sse } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { DataSource, In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { getVerticalConfig } from '../places/business-types';
import { Observable, from, switchMap } from 'rxjs';
import { PlaceTable } from './entities/place-table.entity';
import { Tab } from './entities/tab.entity';
import { Place } from '../places/entities/place.entity';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { OrderEventsService, StreamMessage } from './order-events.service';
import { CreateTableOrderDto, CreateWebOrderDto, PaymentIntentDto, PaymentTokenDto, VerifyTablePinDto } from './dto/orders.dto';
import { webPaymentOptions } from './order-rules';

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
        private dataSource: DataSource,
        private config: ConfigService,
    ) { }

    /**
     * Qué puede hacer el público con este local desde la web: reservar cita (link de la agenda), pedir por WhatsApp
     * (el bot toma recojo/delivery) y pedir desde la carta (`webOrdering`; tarifa en céntimos). Mismas reglas que el backend
     * aplica al reservar o al atender el pedido.
     */
    @Get('places/:placeId/actions')
    async placeActions(@Param('placeId', ParseUUIDPipe) placeId: string) {
        const place = await this.placesRepo.findOne({ where: { id: placeId }, select: ['id', 'businessType', 'status'] });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.status !== 'active') return { bookingUrl: null, orderWhatsapp: null, webOrdering: null };
        const modules = getVerticalConfig(place.businessType).modules;
        const [[pros], settings, [number]] = await Promise.all([
            this.dataSource.query('SELECT count(*)::int AS n FROM wuarike_db.place_professionals WHERE place_id = $1 AND active', [placeId]),
            this.orders.getSettings(placeId),
            this.dataSource.query('SELECT phone_number FROM wuarike_db.whatsapp_numbers WHERE place_id = $1 AND is_active ORDER BY created_at LIMIT 1', [placeId]),
        ]);
        const booking = modules.includes('agenda') && pros.n > 0 && (await this.orders.hasPlan(placeId, 'reputacion'));
        const ordering = modules.includes('pedidos') && settings.ordersEnabled && (settings.pickupEnabled || settings.deliveryEnabled)
            && !!number && (await this.orders.hasPlan(placeId, 'ia_total'));
        // Pedido desde la carta: no depende del número de WhatsApp ni de IA Total. Sin forma de pagar no se ofrece recojo ni delivery.
        let webOrdering: { dineIn: boolean; pickup: boolean; delivery: boolean; deliveryFee: number; deliveryNote: string | null; payOnline: boolean; payOnDelivery: boolean } | null = null;
        if (modules.includes('pedidos') && settings.ordersEnabled && (await this.orders.hasPlan(placeId, 'fidelizacion'))) {
            const { payOnline, payOnDelivery } = webPaymentOptions(settings);
            const canPay = payOnline || payOnDelivery;
            webOrdering = {
                dineIn: (await this.tablesRepo.count({ where: { placeId, active: true } })) > 0,
                pickup: settings.pickupEnabled && canPay, delivery: settings.deliveryEnabled && canPay,
                deliveryFee: settings.deliveryFee, deliveryNote: settings.deliveryNote, payOnline, payOnDelivery,
            };
        }
        const dashboard = this.config.get<string>('DASHBOARD_URL') || 'https://admin.wuarikes.com';
        return {
            bookingUrl: booking ? `${dashboard}/reservar/${placeId}` : null,
            orderWhatsapp: ordering ? String(number.phone_number).replace(/\D/g, '') : null,
            webOrdering,
        };
    }

    /** Mesas activas para elegir "comer aquí"; el pedido sigue por POST orders con el PIN que da el personal. */
    @Get('places/:placeId/tables')
    placeTables(@Param('placeId', ParseUUIDPipe) placeId: string) {
        return this.orders.listPublicTables(placeId);
    }

    /** Pedido para llevar o delivery desde la carta pública. */
    @Post('places/:placeId/orders')
    @Throttle({ default: { ttl: 60000, limit: 5 } })
    createWebOrder(@Param('placeId', ParseUUIDPipe) placeId: string, @Body() dto: CreateWebOrderDto) {
        return this.orders.createWebOrder(placeId, dto);
    }

    @Get('tables/:qrToken')
    async table(@Param('qrToken') qrToken: string) {
        const table = await this.tablesRepo.findOne({ where: { qrToken, active: true } });
        if (!table) throw new NotFoundException('Mesa no encontrada');
        const [place, settings, tablePlan] = await Promise.all([
            this.placesRepo.findOne({ where: { id: table.placeId } }),
            this.orders.getSettings(table.placeId),
            this.orders.hasPlan(table.placeId, 'fidelizacion'),
        ]);
        // La cuenta de la mesa solo se entrega tras validar el PIN (POST tables/:qrToken/verify-pin).
        return {
            place: { id: table.placeId, name: place?.name ?? '' },
            table: { name: table.name },
            ordering: { enabled: settings.ordersEnabled && tablePlan, tablePaymentMode: settings.tablePaymentMode, cashPaymentEnabled: settings.cashPaymentEnabled, tableOnlinePaymentEnabled: settings.tableOnlinePaymentEnabled },
            pinRequired: true,
        };
    }

    @Post('tables/:qrToken/verify-pin')
    @HttpCode(200)
    @Throttle({ default: { ttl: 60000, limit: 10 } })
    async verifyPin(@Param('qrToken') qrToken: string, @Body() dto: VerifyTablePinDto, @Req() req: any) {
        const table = await this.tablesRepo.findOne({ where: { qrToken, active: true } });
        if (!table) throw new NotFoundException('Mesa no encontrada');
        await this.orders.assertTablePin(table, dto.pin, clientIp(req));
        const liveTab = await this.tabsRepo.findOne({ where: { tableId: table.id, status: In(['ABIERTA', 'CUENTA_PEDIDA']) } });
        return { ok: true, liveTabToken: liveTab?.publicToken ?? null };
    }

    @Post('orders')
    @Throttle({ default: { ttl: 60000, limit: 30 } })
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
