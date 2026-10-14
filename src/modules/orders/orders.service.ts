import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm';
import { PlaceOrderSettings } from './entities/place-order-settings.entity';
import { PlaceTable } from './entities/place-table.entity';
import { Tab } from './entities/tab.entity';
import { Order, OrderChannel, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderPayment } from './entities/order-payment.entity';
import { Dish } from '../places/entities/dish.entity';
import { PlaceTeamRole } from '../team/entities/place-team-member.entity';
import { OrderEventsService } from './order-events.service';
import { assertCanCancel, calculateTotals, canTransition, newPublicToken, toCents } from './order-rules';

export interface CartLine { dishId: string; quantity: number; note?: string }

type NewOrderItem = Pick<OrderItem, 'dishId' | 'dishNameSnapshot' | 'unitPrice' | 'quantity' | 'note' | 'lineTotal'>;

export interface TableBoardRow {
    table: PlaceTable;
    tab: Tab | null;
    state: 'LIBRE' | 'OCUPADA' | 'POR_SERVIR' | 'CUENTA_PEDIDA';
    total: number;
    minutesOpen: number | null;
}

const LIVE_TAB: Tab['status'][] = ['ABIERTA', 'CUENTA_PEDIDA', 'PAGADA'];
const PAGE_SIZE = 25;

@Injectable()
export class OrdersService {
    constructor(
        @InjectRepository(PlaceOrderSettings) private settingsRepo: Repository<PlaceOrderSettings>,
        @InjectRepository(PlaceTable) private tablesRepo: Repository<PlaceTable>,
        @InjectRepository(Tab) private tabsRepo: Repository<Tab>,
        @InjectRepository(Order) private ordersRepo: Repository<Order>,
        @InjectRepository(OrderPayment) private paymentsRepo: Repository<OrderPayment>,
        @InjectRepository(Dish) private dishesRepo: Repository<Dish>,
        @InjectDataSource() private dataSource: DataSource,
        private events: OrderEventsService,
        private emitter: EventEmitter2,
    ) { }

    async getSettings(placeId: string): Promise<PlaceOrderSettings> {
        const found = await this.settingsRepo.findOne({ where: { placeId } });
        return found ?? this.settingsRepo.create({ placeId, ordersEnabled: false, tablePaymentMode: 'CUENTA_ABIERTA', paymentDestination: 'LOCAL', pickupEnabled: true, deliveryEnabled: false, deliveryFee: 0, prepTimeMin: 20, pricesIncludeIgv: true, cashPaymentEnabled: true, wuarikesCommissionPct: 0.05, culqiPublicKey: null, culqiSecretKey: null, deliveryNote: null });
    }

    async createTableOrder(qrToken: string, input: { items: CartLine[]; customerName?: string; customerPhone?: string; notes?: string }) {
        const table = await this.tablesRepo.findOne({ where: { qrToken, active: true } });
        if (!table) throw new NotFoundException('Mesa no encontrada');
        const settings = await this.getSettings(table.placeId);
        if (!settings.ordersEnabled) throw new BadRequestException('Este local no está recibiendo pedidos por ahora');

        const items = await this.buildItems(table.placeId, input.items);
        const totals = calculateTotals(items, 0, settings.pricesIncludeIgv);
        const prepaid = settings.tablePaymentMode === 'PREPAGO';
        // La mesa se activa con el primer pedido y todos los pedidos de la mesa se unen en su cuenta,
        // en ambos modos (en prepago cada pedido se paga aparte, pero la mesa sigue siendo una sola).
        const tab = await this.findOrOpenTab(table);

        const order = await this.saveOrder({
            placeId: table.placeId, tabId: tab?.id ?? null, tableId: table.id, channel: 'MESA', fulfillment: 'SALA',
            status: prepaid ? 'PENDIENTE_PAGO' : 'NUEVO', customerName: input.customerName ?? null, customerPhone: input.customerPhone ?? null,
            notes: input.notes ?? null, subtotal: totals.subtotal, deliveryFee: 0, total: totals.total, items,
        });
        if (!prepaid) await this.publish('order.created', order, tab);
        return { order, tab, requiresPayment: prepaid };
    }

    async createWhatsappOrder(placeId: string, input: { items: CartLine[]; customerName: string; customerPhone: string; whatsappNumberId: string | null; fulfillment: 'RECOJO' | 'DELIVERY'; deliveryAddress?: string }) {
        const settings = await this.getSettings(placeId);
        if (input.fulfillment === 'DELIVERY' && !settings.deliveryEnabled) throw new BadRequestException('Este local no hace delivery');
        if (input.fulfillment === 'RECOJO' && !settings.pickupEnabled) throw new BadRequestException('Este local no atiende recojo');
        if (input.fulfillment === 'DELIVERY' && !input.deliveryAddress?.trim()) throw new BadRequestException('Falta la dirección de entrega');

        const items = await this.buildItems(placeId, input.items);
        const fee = input.fulfillment === 'DELIVERY' ? settings.deliveryFee : 0;
        const totals = calculateTotals(items, fee, settings.pricesIncludeIgv);
        return this.saveOrder({
            placeId, tabId: null, tableId: null, channel: 'WHATSAPP', fulfillment: input.fulfillment, status: 'PENDIENTE_PAGO',
            customerName: input.customerName, customerPhone: input.customerPhone, whatsappNumberId: input.whatsappNumberId,
            deliveryAddress: input.deliveryAddress ?? null, notes: null, subtotal: totals.subtotal, deliveryFee: fee, total: totals.total, items,
        });
    }

    /** PENDIENTE_PAGO → NUEVO una sola vez (webhook y revisión periódica pueden llegar a la vez). */
    async markOrderPaid(orderId: string): Promise<Order | null> {
        const result = await this.ordersRepo.update({ id: orderId, status: 'PENDIENTE_PAGO' }, { status: 'NUEVO', paidAt: new Date() });
        if (!result.affected) return null;
        const order = await this.ordersRepo.findOne({ where: { id: orderId } });
        const tab = order!.tabId ? await this.tabsRepo.findOne({ where: { id: order!.tabId } }) : null;
        await this.publish('order.created', order!, tab);
        return order;
    }

    async changeStatus(placeId: string, orderId: string, to: OrderStatus, role: PlaceTeamRole, reason?: string): Promise<Order> {
        const order = await this.ordersRepo.findOne({ where: { id: orderId, placeId } });
        if (!order) throw new NotFoundException('Pedido no encontrado');
        if (to === 'CANCELADO') assertCanCancel(order.status, role);
        else if (!canTransition(order.status, to)) throw new BadRequestException(`No se puede pasar de ${order.status} a ${to}`);

        const now = new Date();
        const patch: Partial<Order> = { status: to };
        if (to === 'LISTO') patch.readyAt = now;
        if (to === 'ENTREGADO') patch.deliveredAt = now;
        if (to === 'CANCELADO') {
            patch.canceledAt = now;
            patch.cancelReason = reason ?? null;
            // Sobrepago: si la cuenta de la mesa ya recibió pagos, lo de este pedido se devuelve.
            patch.refundPending = !!order.paidAt || (!!order.tabId && !!(await this.paymentsRepo.findOne({ where: { tabId: order.tabId, status: 'PAGADO' } })));
        }
        const result = await this.ordersRepo.update({ id: orderId, status: order.status }, patch);
        if (!result.affected) throw new BadRequestException('El pedido cambió mientras tanto, recarga la pantalla');
        if (to === 'CANCELADO') await this.expirePendingPayments(orderId);
        const updated = { ...order, ...patch } as Order;
        const tab = updated.tabId ? await this.tabsRepo.findOne({ where: { id: updated.tabId } }) : null;
        await this.publish('order.status_changed', updated, tab);
        this.emitter.emit('orders.status.changed', { orderId: updated.id, status: updated.status });
        return updated;
    }

    async requestBill(tabToken: string): Promise<Tab> {
        const tab = await this.tabsRepo.findOne({ where: { publicToken: tabToken } });
        if (!tab) throw new NotFoundException('Cuenta no encontrada');
        if (tab.status !== 'ABIERTA') return tab;
        await this.tabsRepo.update({ id: tab.id, status: 'ABIERTA' }, { status: 'CUENTA_PEDIDA', billRequestedAt: new Date() });
        const updated = { ...tab, status: 'CUENTA_PEDIDA' as const };
        await this.events.publish({ type: 'tab.bill_requested', placeId: tab.placeId, tabId: tab.id, tableId: tab.tableId, status: updated.status, publicTokens: [tab.publicToken] });
        return updated;
    }

    async closeTab(placeId: string, tabId: string): Promise<Tab> {
        const tab = await this.tabsRepo.findOne({ where: { id: tabId, placeId } });
        if (!tab) throw new NotFoundException('Cuenta no encontrada');
        const { due } = await this.tabTotal(tabId);
        if (due > 0) throw new BadRequestException('La cuenta todavía tiene saldo pendiente');
        await this.tabsRepo.update({ id: tabId }, { status: 'CERRADA', closedAt: new Date() });
        await this.events.publish({ type: 'tab.closed', placeId, tabId, tableId: tab.tableId, status: 'CERRADA', publicTokens: [tab.publicToken] });
        return { ...tab, status: 'CERRADA' };
    }

    /** Consumo de toda la mesa (todos los comensales). Cuenta los pagos hechos a la cuenta y a cada pedido (prepago). */
    async tabTotal(tabId: string) {
        const orders = (await this.ordersRepo.find({ where: { tabId } })).filter((o) => o.status !== 'CANCELADO' && o.status !== 'PENDIENTE_PAGO');
        const total = orders.reduce((s, o) => s + o.total, 0);
        const tabPayments = await this.paymentsRepo.find({ where: { tabId, status: 'PAGADO' } });
        const orderPayments = orders.length ? await this.paymentsRepo.find({ where: { orderId: In(orders.map((o) => o.id)), status: 'PAGADO' } }) : [];
        const paid = [...tabPayments, ...orderPayments].reduce((s, p) => s + p.amount, 0);
        return { total, paid, due: Math.max(0, total - paid) };
    }

    async cancelUnpaid(orderId: string, reason: string): Promise<void> {
        const result = await this.ordersRepo.update({ id: orderId, status: 'PENDIENTE_PAGO' }, { status: 'CANCELADO', canceledAt: new Date(), cancelReason: reason });
        if (result.affected) await this.expirePendingPayments(orderId);
    }

    /** Un pedido cancelado no puede seguir cobrándose: sus checkouts abiertos dejan de ser pagables. */
    private async expirePendingPayments(orderId: string): Promise<void> {
        await this.paymentsRepo.update({ orderId, status: 'PENDIENTE' }, { status: 'EXPIRADO' });
    }

    /** Llamado por PaymentsService cuando se confirma un pago de cuenta. */
    async refreshTabAfterPayment(tabId: string): Promise<void> {
        const tab = await this.tabsRepo.findOne({ where: { id: tabId } });
        if (!tab) return;
        const { due } = await this.tabTotal(tabId);
        if (due === 0 && tab.status !== 'PAGADA' && tab.status !== 'CERRADA') await this.tabsRepo.update({ id: tabId }, { status: 'PAGADA' });
        await this.events.publish({ type: 'tab.updated', placeId: tab.placeId, tabId, tableId: tab.tableId, status: due === 0 ? 'PAGADA' : tab.status, publicTokens: [tab.publicToken] });
    }

    async getPublicOrder(publicToken: string) {
        const order = await this.ordersRepo.findOne({ where: { publicToken }, relations: ['items'] });
        if (!order) throw new NotFoundException('Pedido no encontrado');
        return this.publicView(order);
    }

    async getPublicTab(publicToken: string) {
        const tab = await this.tabsRepo.findOne({ where: { publicToken } });
        if (!tab) throw new NotFoundException('Cuenta no encontrada');
        const orders = await this.ordersRepo.find({ where: { tabId: tab.id }, relations: ['items'], order: { createdAt: 'ASC' } });
        const sums = await this.tabTotal(tab.id);
        return { status: tab.status, ...sums, orders: orders.map((o) => this.publicView(o)) };
    }

    async listForPlace(placeId: string, filter: { status?: OrderStatus[]; channel?: OrderChannel; q?: string; from?: Date; page?: number }) {
        const qb = this.ordersRepo.createQueryBuilder('o').leftJoinAndSelect('o.items', 'i').where('o.place_id = :placeId', { placeId });
        if (filter.status?.length) qb.andWhere('o.status IN (:...status)', { status: filter.status });
        if (filter.channel) qb.andWhere('o.channel = :channel', { channel: filter.channel });
        if (filter.from) qb.andWhere('o.created_at >= :from', { from: filter.from });
        if (filter.q) {
            const asNumber = parseInt(filter.q.replace('#', ''), 10);
            if (!isNaN(asNumber)) qb.andWhere('o.number = :n', { n: asNumber });
            else qb.andWhere('(o.customer_phone ILIKE :q OR o.customer_name ILIKE :q)', { q: `%${filter.q}%` });
        }
        const page = Math.max(1, filter.page ?? 1);
        const [items, total] = await qb.orderBy('o.created_at', 'DESC').skip((page - 1) * PAGE_SIZE).take(PAGE_SIZE).getManyAndCount();
        return { items, total };
    }

    /** Pantalla de cocina: sin paginar (tope 200) y sin datos del cliente (teléfono, dirección, token público). */
    async listActiveForKds(placeId: string) {
        const orders = await this.ordersRepo.find({
            where: { placeId, status: In(['NUEVO', 'EN_PREPARACION', 'LISTO']), createdAt: MoreThanOrEqual(new Date(Date.now() - 24 * 3600_000)) },
            relations: ['items'], order: { createdAt: 'ASC' }, take: 200,
        });
        return orders.map((o) => ({
            id: o.id, number: o.number, channel: o.channel, fulfillment: o.fulfillment, status: o.status, tableId: o.tableId, notes: o.notes, createdAt: o.createdAt,
            items: (o.items ?? []).map((i) => ({ id: i.id, name: i.dishNameSnapshot, quantity: i.quantity, note: i.note })),
        }));
    }

    async tablesBoard(placeId: string): Promise<TableBoardRow[]> {
        const tables = await this.tablesRepo.find({ where: { placeId, active: true }, order: { displayOrder: 'ASC', name: 'ASC' } });
        const tabs = await this.tabsRepo.find({ where: { placeId, status: In(LIVE_TAB) } });
        const now = Date.now();
        return Promise.all(tables.map(async (table) => {
            const tab = tabs.find((t) => t.tableId === table.id) ?? null;
            if (!tab) return { table, tab: null, state: 'LIBRE' as const, total: 0, minutesOpen: null };
            const orders = await this.ordersRepo.find({ where: { tabId: tab.id } });
            const { total } = await this.tabTotal(tab.id);
            const state = tab.status === 'CUENTA_PEDIDA' ? 'CUENTA_PEDIDA' : orders.some((o) => o.status === 'LISTO') ? 'POR_SERVIR' : 'OCUPADA';
            return { table, tab, state, total, minutesOpen: Math.floor((now - new Date(tab.openedAt).getTime()) / 60000) };
        }));
    }

    private async buildItems(placeId: string, lines: CartLine[]): Promise<NewOrderItem[]> {
        if (!lines?.length) throw new BadRequestException('El pedido está vacío');
        const dishes = await this.dishesRepo.find({ where: { placeId, id: In(lines.map((l) => l.dishId)) } });
        return lines.map((line) => {
            const dish = dishes.find((d) => d.id === line.dishId);
            if (!dish) throw new BadRequestException('Este plato ya no está disponible');
            if (!dish.isAvailable) throw new BadRequestException(`Este plato ya no está disponible: ${dish.name}`);
            const quantity = Math.max(1, Math.min(50, Math.floor(line.quantity)));
            const unitPrice = toCents(dish.price as any);
            return { dishId: dish.id, dishNameSnapshot: dish.name, unitPrice, quantity, note: line.note?.slice(0, 200) ?? null, lineTotal: unitPrice * quantity };
        });
    }

    private async saveOrder(data: Omit<Partial<Order>, 'items'> & { items: NewOrderItem[] }): Promise<Order> {
        const number = await this.nextNumber(data.placeId!);
        const order = this.ordersRepo.create({ ...data, number, publicToken: newPublicToken() } as Order);
        return this.ordersRepo.save(order);
    }

    private async nextNumber(placeId: string): Promise<number> {
        const rows = await this.dataSource.query(
            `INSERT INTO wuarike_db.place_order_counters (place_id, last_number) VALUES ($1, 1)
             ON CONFLICT (place_id) DO UPDATE SET last_number = wuarike_db.place_order_counters.last_number + 1
             RETURNING last_number`,
            [placeId],
        );
        return rows[0].last_number;
    }

    private async findOrOpenTab(table: PlaceTable): Promise<Tab> {
        const live = await this.tabsRepo.findOne({ where: { tableId: table.id, status: In(['ABIERTA', 'CUENTA_PEDIDA']) } });
        if (live) return live;
        // Una cuenta PAGADA ocupa el índice único de la mesa: se cierra (condicional) antes de abrir la nueva.
        await this.tabsRepo.update({ tableId: table.id, status: 'PAGADA' }, { status: 'CERRADA', closedAt: new Date() });
        try {
            return await this.tabsRepo.save(this.tabsRepo.create({ placeId: table.placeId, tableId: table.id, status: 'ABIERTA', publicToken: newPublicToken() }));
        } catch (err: any) {
            // Otro comensal de la misma mesa abrió la cuenta en el mismo instante: usar esa.
            if (err?.code !== '23505') throw err;
            const winner = await this.tabsRepo.findOne({ where: { tableId: table.id, status: In(['ABIERTA', 'CUENTA_PEDIDA']) } });
            if (!winner) throw err;
            return winner;
        }
    }

    private publicView(order: Order) {
        return {
            number: order.number, status: order.status, channel: order.channel, fulfillment: order.fulfillment,
            subtotal: order.subtotal, deliveryFee: order.deliveryFee, total: order.total, createdAt: order.createdAt,
            items: (order.items ?? []).map((i) => ({ name: i.dishNameSnapshot, quantity: i.quantity, unitPrice: i.unitPrice, note: i.note })),
        };
    }

    private async publish(type: 'order.created' | 'order.status_changed', order: Order, tab: Tab | null) {
        await this.events.publish({ type, placeId: order.placeId, orderId: order.id, tabId: order.tabId ?? undefined, tableId: order.tableId ?? undefined, status: order.status, publicTokens: [order.publicToken, ...(tab ? [tab.publicToken] : [])] });
    }
}
