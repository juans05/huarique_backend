import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, Sse } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { In, Repository } from 'typeorm';
import { Observable } from 'rxjs';
import { PlaceTable } from './entities/place-table.entity';
import { Tab } from './entities/tab.entity';
import { Place } from '../places/entities/place.entity';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { OrderEventsService, StreamMessage } from './order-events.service';
import { CreateTableOrderDto, PaymentIntentDto, PaymentTokenDto } from './dto/orders.dto';

@Controller('public')
export class PublicOrdersController {
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
        const [place, settings, liveTab] = await Promise.all([
            this.placesRepo.findOne({ where: { id: table.placeId } }),
            this.orders.getSettings(table.placeId),
            this.tabsRepo.findOne({ where: { tableId: table.id, status: In(['ABIERTA', 'CUENTA_PEDIDA', 'PAGADA']) } }),
        ]);
        return {
            place: { id: table.placeId, name: place?.name ?? '' },
            table: { name: table.name },
            ordering: { enabled: settings.ordersEnabled, tablePaymentMode: settings.tablePaymentMode, cashPaymentEnabled: settings.cashPaymentEnabled },
            liveTabToken: liveTab?.publicToken ?? null,
        };
    }

    @Post('orders')
    @Throttle({ default: { ttl: 60000, limit: 10 } })
    async createOrder(@Body() dto: CreateTableOrderDto) {
        const { order, tab, requiresPayment } = await this.orders.createTableOrder(dto.qrToken, dto);
        return { orderToken: order.publicToken, tabToken: tab?.publicToken ?? null, requiresPayment };
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

    @Sse('stream/:token')
    stream(@Param('token') token: string): Observable<StreamMessage> {
        return this.events.streamForToken(token);
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
    webhook(@Query('place') placeId?: string) {
        this.payments.reconcilePending(placeId).catch(() => undefined);
        return { received: true };
    }
}
