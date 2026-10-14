import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { OrderPayment, PaymentStatus } from './entities/order-payment.entity';
import { Order } from './entities/order.entity';
import { Tab } from './entities/tab.entity';
import { PlaceOrderSettings } from './entities/place-order-settings.entity';
import { OrdersService } from './orders.service';
import { OrderEventsService } from './order-events.service';
import { culqiRequest } from './culqi-client';

const PAYMENT_TTL_MS = 24 * 3600_000;

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        @InjectRepository(OrderPayment) private paymentsRepo: Repository<OrderPayment>,
        @InjectRepository(Order) private ordersRepo: Repository<Order>,
        @InjectRepository(Tab) private tabsRepo: Repository<Tab>,
        private orders: OrdersService,
        private events: OrderEventsService,
        private emitter: EventEmitter2,
        private config: ConfigService,
    ) { }

    async startOnlinePayment(target: { orderToken?: string; tabToken?: string }, customer: { email: string; name?: string; phone?: string }) {
        const { placeId, orderId, tabId, amount, title } = await this.resolveTarget(target);
        if (amount <= 0) throw new BadRequestException('No hay saldo pendiente por pagar');
        const settings = await this.orders.getSettings(placeId);
        const keys = this.keysFor(settings);

        const payment = await this.paymentsRepo.save(this.paymentsRepo.create({
            placeId, orderId, tabId, method: 'ONLINE', amount, status: 'PENDIENTE', destination: settings.paymentDestination,
            customerEmail: customer.email.trim().toLowerCase(), expiresAt: new Date(Date.now() + PAYMENT_TTL_MS),
        }));

        let culqiOrderId: string | null = null;
        try {
            const [firstName, ...rest] = (customer.name || 'Cliente').trim().split(/\s+/);
            const culqiOrder = await culqiRequest(keys.secretKey, 'POST', '/orders', {
                amount, currency_code: 'PEN', description: title.slice(0, 80), order_number: payment.id.replace(/-/g, '').slice(0, 30),
                client_details: { first_name: firstName, last_name: rest.join(' ') || firstName, email: payment.customerEmail, phone_number: customer.phone || '999999999' },
                expiration_date: Math.floor((Date.now() + PAYMENT_TTL_MS) / 1000), confirm: false,
            });
            culqiOrderId = culqiOrder.id;
            await this.paymentsRepo.update({ id: payment.id }, { culqiOrderId });
        } catch (err: any) {
            // ponytail: sin órdenes Culqi (cuenta sin PagoEfectivo habilitado) se ofrece solo tarjeta/Yape.
            this.logger.warn(`Sin orden Culqi para el pago ${payment.id}: ${err?.message}`);
        }
        return { paymentId: payment.id, amount, publicKey: keys.publicKey, culqiOrderId, title };
    }

    async payWithToken(paymentId: string, token: string) {
        const payment = await this.paymentsRepo.findOne({ where: { id: paymentId } });
        if (!payment) throw new BadRequestException('Este pago ya no está pendiente');
        // Reclamo condicional: dos envíos del mismo checkout nunca llegan los dos a Culqi.
        const claimed = await this.paymentsRepo.update({ id: payment.id, status: 'PENDIENTE' }, { status: 'PROCESANDO' });
        if (!claimed.affected) throw new BadRequestException('Este pago ya no está pendiente');

        if (!(await this.targetStillDue(payment))) {
            await this.paymentsRepo.update({ id: payment.id, status: 'PROCESANDO' }, { status: 'EXPIRADO' });
            throw new BadRequestException('Este pago ya no está pendiente');
        }

        let charge: any;
        try {
            const keys = this.keysFor(await this.orders.getSettings(payment.placeId));
            charge = await culqiRequest(keys.secretKey, 'POST', '/charges', {
                amount: payment.amount, currency_code: 'PEN', email: payment.customerEmail, source_id: token,
                metadata: { paymentId: payment.id, placeId: payment.placeId },
            });
        } catch (err) {
            // Rechazo conocido (tarjeta, llaves): se puede reintentar. Error inesperado: FALLIDO para revisarlo a mano.
            await this.paymentsRepo.update({ id: payment.id, status: 'PROCESANDO' }, { status: err instanceof BadRequestException ? 'PENDIENTE' : 'FALLIDO' });
            throw err;
        }
        if (charge.action_code === 'REVIEW' || charge.outcome?.type !== 'venta_exitosa') {
            await this.paymentsRepo.update({ id: payment.id, status: 'PROCESANDO' }, { status: 'PENDIENTE' });
            // ponytail: sin flujo 3DS; si el banco lo exige se pide otra tarjeta (igual que suscripciones).
            throw new BadRequestException(charge.user_message || charge.outcome?.user_message || 'Tu banco pidió una verificación adicional. Prueba con otra tarjeta.');
        }
        const method = token.startsWith('ype') ? 'YAPE' : 'TARJETA';
        const confirmed = await this.confirm(payment.id, { method, culqiChargeId: charge.id, culqiFee: charge.total_fee ?? 0 });
        if (!confirmed) {
            this.logger.error(`Cargo ${charge.id} cobrado pero el pago ${payment.id} ya no estaba en proceso: revisar devolución`);
            throw new BadRequestException('Este pago ya no está pendiente');
        }
        return { status: 'PAGADO' as const };
    }

    /** Revalida justo antes de cobrar: el pedido sigue esperando pago o la cuenta aún debe al menos este monto. */
    private async targetStillDue(payment: OrderPayment): Promise<boolean> {
        if (payment.orderId) {
            const order = await this.ordersRepo.findOne({ where: { id: payment.orderId } });
            return order?.status === 'PENDIENTE_PAGO';
        }
        if (payment.tabId) return (await this.orders.tabTotal(payment.tabId)).due >= payment.amount;
        return false;
    }

    async recordManualPayment(placeId: string, target: { orderId?: string; tabId?: string }, method: 'EFECTIVO' | 'POS', userId: string) {
        let amount: number;
        if (target.tabId) {
            const tab = await this.tabsRepo.findOne({ where: { id: target.tabId, placeId } });
            if (!tab) throw new NotFoundException('Cuenta no encontrada');
            amount = (await this.orders.tabTotal(tab.id)).due;
        } else {
            const order = await this.ordersRepo.findOne({ where: { id: target.orderId, placeId } });
            if (!order) throw new NotFoundException('Pedido no encontrado');
            if (order.status !== 'PENDIENTE_PAGO') throw new BadRequestException('Este pedido ya está pagado');
            amount = order.total;
        }
        if (amount <= 0) throw new BadRequestException('No hay saldo pendiente por pagar');
        const payment = await this.paymentsRepo.save(this.paymentsRepo.create({
            placeId, orderId: target.orderId ?? null, tabId: target.tabId ?? null, method, amount, status: 'PENDIENTE', destination: 'LOCAL', recordedByUserId: userId,
        }));
        await this.confirm(payment.id, { method });
        return { ...payment, status: 'PAGADO' as const };
    }

    async getStatus(paymentId: string): Promise<{ status: PaymentStatus }> {
        const payment = await this.paymentsRepo.findOne({ where: { id: paymentId } });
        if (!payment) throw new NotFoundException('Pago no encontrado');
        return { status: payment.status };
    }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async reconcileCron() {
        await this.reconcilePending().catch((err) => this.logger.error('Conciliación de pagos falló', err));
    }

    /** No confía en el cuerpo del webhook: consulta a Culqi cada pago pendiente con orden. */
    async reconcilePending(placeId?: string): Promise<void> {
        const pending = await this.paymentsRepo.find({ where: { status: 'PENDIENTE', culqiOrderId: Not(IsNull()), ...(placeId ? { placeId } : {}) } });
        for (const payment of pending) {
            try {
                const keys = this.keysFor(await this.orders.getSettings(payment.placeId));
                const remote = await culqiRequest(keys.secretKey, 'GET', `/orders/${payment.culqiOrderId}`);
                if (remote.state === 'paid') {
                    await this.confirm(payment.id, { method: 'PAGOEFECTIVO' });
                } else if (payment.expiresAt && payment.expiresAt.getTime() < Date.now()) {
                    const expired = await this.paymentsRepo.update({ id: payment.id, status: 'PENDIENTE' }, { status: 'EXPIRADO' });
                    if (expired.affected && payment.orderId) await this.orders.cancelUnpaid(payment.orderId, 'El código de pago venció');
                }
            } catch (err: any) {
                this.logger.warn(`No se pudo conciliar el pago ${payment.id}: ${err?.message}`);
            }
        }
    }

    private async confirm(paymentId: string, patch: Partial<OrderPayment>): Promise<boolean> {
        const result = await this.paymentsRepo.update({ id: paymentId, status: In(['PENDIENTE', 'PROCESANDO']) }, { ...patch, status: 'PAGADO', paidAt: new Date() });
        if (!result.affected) return false;
        const payment = (await this.paymentsRepo.findOne({ where: { id: paymentId } }))!;
        let orderIds: string[] = [];
        if (payment.orderId) {
            if (!(await this.orders.markOrderPaid(payment.orderId))) {
                // Pedido ya pagado por otro medio o cancelado: el dinero entró pero hay que devolverlo.
                await this.ordersRepo.update({ id: payment.orderId }, { refundPending: true });
                this.logger.warn(`Pago ${payment.id} confirmado para el pedido ${payment.orderId} que ya no esperaba pago: devolución pendiente`);
                return true;
            }
            orderIds = [payment.orderId];
        }
        if (payment.tabId) {
            await this.orders.refreshTabAfterPayment(payment.tabId);
            orderIds = (await this.ordersRepo.find({ where: { tabId: payment.tabId } })).filter((o) => o.status !== 'CANCELADO').map((o) => o.id);
        }
        await this.events.publish({ type: 'payment.confirmed', placeId: payment.placeId, orderId: payment.orderId ?? undefined, tabId: payment.tabId ?? undefined, publicTokens: await this.tokensFor(payment) });
        this.emitter.emit('orders.payment.confirmed', { paymentId, placeId: payment.placeId, orderIds });
        return true;
    }

    private async resolveTarget(target: { orderToken?: string; tabToken?: string }) {
        if (target.tabToken) {
            const tab = await this.tabsRepo.findOne({ where: { publicToken: target.tabToken } });
            if (!tab) throw new NotFoundException('Cuenta no encontrada');
            const { due } = await this.orders.tabTotal(tab.id);
            return { placeId: tab.placeId, orderId: null, tabId: tab.id, amount: due, title: 'Cuenta de mesa' };
        }
        const order = await this.ordersRepo.findOne({ where: { publicToken: target.orderToken } });
        if (!order) throw new NotFoundException('Pedido no encontrado');
        if (order.status !== 'PENDIENTE_PAGO') throw new BadRequestException('Este pedido ya está pagado');
        return { placeId: order.placeId, orderId: order.id, tabId: null, amount: order.total, title: `Pedido #${order.number}` };
    }

    private keysFor(settings: PlaceOrderSettings): { publicKey: string; secretKey: string } {
        if (settings.paymentDestination === 'LOCAL') {
            if (!settings.culqiPublicKey || !settings.culqiSecretKey) throw new BadRequestException('El local no configuró sus pagos online');
            return { publicKey: settings.culqiPublicKey, secretKey: settings.culqiSecretKey };
        }
        return { publicKey: this.config.get<string>('CULQI_PUBLIC_KEY') || '', secretKey: this.config.get<string>('CULQI_SECRET_KEY') || '' };
    }

    private async tokensFor(payment: OrderPayment): Promise<string[]> {
        if (payment.tabId) {
            const tab = await this.tabsRepo.findOne({ where: { id: payment.tabId } });
            return tab ? [tab.publicToken] : [];
        }
        const order = await this.ordersRepo.findOne({ where: { id: payment.orderId! } });
        return order ? [order.publicToken] : [];
    }
}
