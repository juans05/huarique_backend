import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { CashSession, CashTotals } from './entities/cash-session.entity';
import { CashMethod, Receipt, ReceiptItem } from './entities/receipt.entity';
import { Tab } from './entities/tab.entity';
import { PlaceTable } from './entities/place-table.entity';
import { DEFAULT_RECEIPT_SERIES } from './entities/place-order-settings.entity';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { OrderEventsService } from './order-events.service';
import { ChargeDto, PrecuentaDto, SaleDto } from './dto/cash.dto';
import { Dish } from '../places/entities/dish.entity';
import { toCents } from './order-rules';
import { receiptCode, receiptCustomerError } from './cash-rules';

const PAYMENT_METHOD: Record<CashMethod, 'EFECTIVO' | 'POS' | 'YAPE'> = { EFECTIVO: 'EFECTIVO', TARJETA: 'POS', YAPE_PLIN: 'YAPE' };

/** Caja: apertura, cobro de precuentas con comprobante (ticket/boleta/factura) y cierre de turno. */
@Injectable()
export class CashService {
    constructor(
        @InjectRepository(CashSession) private sessionsRepo: Repository<CashSession>,
        @InjectRepository(Receipt) private receiptsRepo: Repository<Receipt>,
        @InjectRepository(Tab) private tabsRepo: Repository<Tab>,
        @InjectRepository(PlaceTable) private tablesRepo: Repository<PlaceTable>,
        @InjectRepository(Dish) private dishesRepo: Repository<Dish>,
        private dataSource: DataSource,
        private orders: OrdersService,
        private payments: PaymentsService,
        private events: OrderEventsService,
        private emitter: EventEmitter2,
    ) { }

    /** Estado de la caja: turno abierto (o null), totales, precuentas por cobrar y comprobantes del turno. */
    async current(placeId: string) {
        const session = await this.sessionsRepo.findOne({ where: { placeId, status: 'ABIERTA' } });
        const [pending, appointments] = await Promise.all([this.pendingPrecuentas(placeId), this.appointmentsToCharge(placeId)]);
        if (!session) return { session: null, totals: null, pending, appointments, receipts: [] };
        const receipts = await this.receiptsRepo.find({ where: { cashSessionId: session.id }, relations: ['items'], order: { createdAt: 'DESC' } });
        return { session, totals: this.sum(receipts), pending, appointments, receipts: receipts.map((r) => ({ ...r, code: receiptCode(r.series, r.number) })) };
    }

    async open(placeId: string, userId: string, openingAmount: number) {
        if (await this.sessionsRepo.findOne({ where: { placeId, status: 'ABIERTA' } })) throw new BadRequestException('La caja ya está abierta');
        return this.sessionsRepo.save(this.sessionsRepo.create({ placeId, openingAmount, openedByUserId: userId, status: 'ABIERTA' }));
    }

    async close(placeId: string, userId: string, countedCash?: number) {
        const session = await this.requireOpen(placeId);
        return this.dataSource.transaction(async (em) => {
            // Espera a que termine cualquier cobro en curso: así el arqueo incluye todos los comprobantes del turno.
            await this.lockOpen(em, session.id);
            const totals = this.sum(await em.find(Receipt, { where: { cashSessionId: session.id } }));
            const expectedCash = session.openingAmount + totals.EFECTIVO;
            await em.update(CashSession, { id: session.id }, {
                status: 'CERRADA', closedAt: new Date(), closedByUserId: userId, totals, expectedCash, countedCash: countedCash ?? null,
            });
            return { ...session, status: 'CERRADA' as const, totals, expectedCash, countedCash: countedCash ?? null, difference: countedCash == null ? null : countedCash - expectedCash };
        });
    }

    /** El mozo pide la precuenta con los datos del comprobante; la mesa pasa a "cuenta pedida". */
    async requestPrecuenta(placeId: string, tabId: string, dto: PrecuentaDto) {
        const tab = await this.tabsRepo.findOne({ where: { id: tabId, placeId } });
        if (!tab) throw new NotFoundException('Cuenta no encontrada');
        if (tab.status === 'CERRADA') throw new BadRequestException('Esta cuenta ya está cerrada');
        const { due } = await this.orders.tabTotal(tab.id);
        const error = receiptCustomerError(dto.docType, dto, due);
        if (error) throw new BadRequestException(error);
        const status = tab.status === 'ABIERTA' ? 'CUENTA_PEDIDA' : tab.status;
        await this.tabsRepo.update({ id: tab.id }, { precuenta: this.clean(dto), status, billRequestedAt: tab.billRequestedAt ?? new Date() });
        await this.events.publish({ type: 'tab.bill_requested', placeId, tabId: tab.id, tableId: tab.tableId, status, publicTokens: [tab.publicToken] });
        return { ...tab, status, precuenta: this.clean(dto) };
    }

    /** Cobra la cuenta completa, emite el comprobante con el siguiente número de su serie y libera la mesa. */
    async charge(placeId: string, userId: string, dto: ChargeDto) {
        const session = await this.requireOpen(placeId);
        const settings = await this.orders.getSettings(placeId);
        const series = (settings.receiptSeries ?? DEFAULT_RECEIPT_SERIES)[dto.docType];

        // ponytail: un cobro a la vez por local (bloquea la fila de la caja abierta); basta para el volumen de una caja.
        // Dentro del bloqueo se vuelve a leer el saldo, así dos cajeros no cobran dos veces la misma cuenta,
        // y el cierre de turno espera a que termine el cobro.
        const receipt = await this.dataSource.transaction(async (em) => {
            await this.lockOpen(em, session.id);
            const tab = await this.tabsRepo.findOne({ where: { id: dto.tabId, placeId } });
            if (!tab || tab.status === 'CERRADA') throw new NotFoundException('Cuenta no encontrada');
            const { due } = await this.orders.tabTotal(tab.id);
            if (due <= 0) throw new BadRequestException('Esta cuenta no tiene saldo por cobrar');
            const error = receiptCustomerError(dto.docType, dto, due);
            if (error) throw new BadRequestException(error);

            const payment = await this.payments.recordManualPayment(placeId, { tabId: tab.id }, PAYMENT_METHOD[dto.method], userId);
            const table = await this.tablesRepo.findOne({ where: { id: tab.tableId } });
            const [{ max }] = await em.query(`SELECT COALESCE(MAX(number), 0) AS max FROM wuarike_db.receipts WHERE place_id = $1 AND series = $2`, [placeId, series]);
            const customer = this.clean(dto);
            return em.save(em.create(Receipt, {
                placeId, cashSessionId: session.id, tabId: tab.id, tableName: table?.name ?? null, paymentId: payment.id,
                docType: dto.docType, series, number: Number(max) + 1, paymentMethod: dto.method, total: payment.amount, createdByUserId: userId,
                customerDocType: customer.customerDocType ?? null, customerDocNumber: customer.customerDocNumber ?? null,
                customerName: customer.customerName ?? null, customerAddress: customer.customerAddress ?? null,
            }));
        });
        await this.orders.closeTab(placeId, receipt.tabId!);
        return { ...receipt, code: receiptCode(receipt.series, receipt.number) };
    }

    /**
     * Venta directa (mostrador: productos y servicios del catálogo u "otro ítem") o cobro de una cita
     * (la cita aporta su servicio y se pueden sumar productos). Emite el comprobante con su serie.
     */
    async sell(placeId: string, userId: string, dto: SaleDto) {
        const session = await this.requireOpen(placeId);
        const settings = await this.orders.getSettings(placeId);
        const series = (settings.receiptSeries ?? DEFAULT_RECEIPT_SERIES)[dto.docType];
        const dishIds = (dto.items ?? []).filter((l) => l.dishId).map((l) => l.dishId!);
        const dishes = dishIds.length ? await this.dishesRepo.find({ where: { placeId, id: In(dishIds) } }) : [];

        const lines: Omit<ReceiptItem, 'id' | 'receiptId' | 'receipt'>[] = (dto.items ?? []).map((l) => {
            if (l.dishId) {
                const dish = dishes.find((d) => d.id === l.dishId);
                if (!dish) throw new BadRequestException('Uno de los ítems ya no está en el catálogo');
                const unitPrice = toCents(dish.price as any);
                return { dishId: dish.id, description: dish.name, quantity: l.quantity, unitPrice, lineTotal: unitPrice * l.quantity };
            }
            if (!l.name?.trim() || l.unitPrice == null) throw new BadRequestException('Cada "otro ítem" necesita nombre y precio');
            return { dishId: null, description: l.name.trim(), quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.unitPrice * l.quantity };
        });

        const receipt = await this.dataSource.transaction(async (em) => {
            await this.lockOpen(em, session.id);
            let label = 'Mostrador';
            if (dto.appointmentId) {
                // Bloquea la cita: dos cajeros no la cobran dos veces.
                const [appt] = await em.query(
                    `SELECT a.id, a.service_id, a.service_name, a.price, a.status, a.receipt_id, p.name AS pro
                     FROM wuarike_db.appointments a JOIN wuarike_db.place_professionals p ON p.id = a.professional_id
                     WHERE a.id = $1 AND a.place_id = $2 FOR UPDATE OF a`,
                    [dto.appointmentId, placeId],
                );
                if (!appt || appt.status === 'CANCELADA') throw new NotFoundException('Cita no encontrada');
                if (appt.receipt_id) throw new BadRequestException('Esta cita ya fue cobrada');
                lines.unshift({ dishId: appt.service_id, description: appt.service_name, quantity: 1, unitPrice: appt.price, lineTotal: appt.price });
                label = `Cita · ${appt.pro}`;
            }
            const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
            if (!lines.length || total <= 0) throw new BadRequestException('Agrega al menos un ítem con precio');
            const error = receiptCustomerError(dto.docType, dto, total);
            if (error) throw new BadRequestException(error);

            const [{ max }] = await em.query(`SELECT COALESCE(MAX(number), 0) AS max FROM wuarike_db.receipts WHERE place_id = $1 AND series = $2`, [placeId, series]);
            const customer = this.clean(dto);
            const saved = await em.save(em.create(Receipt, {
                placeId, cashSessionId: session.id, kind: dto.appointmentId ? 'CITA' : 'VENTA', appointmentId: dto.appointmentId ?? null, tabId: null,
                tableName: label, paymentId: null, docType: dto.docType, series, number: Number(max) + 1, paymentMethod: dto.method, total, createdByUserId: userId,
                customerDocType: customer.customerDocType ?? null, customerDocNumber: customer.customerDocNumber ?? null,
                customerName: customer.customerName ?? null, customerAddress: customer.customerAddress ?? null,
                items: lines.map((l) => em.create(ReceiptItem, l)),
            }));
            if (dto.appointmentId) {
                await em.query(`UPDATE wuarike_db.appointments SET receipt_id = $1, status = CASE WHEN status = 'RESERVADA' THEN 'ATENDIDA' ELSE status END WHERE id = $2`, [saved.id, dto.appointmentId]);
            }
            return saved;
        });
        // El inventario descuenta lo vendido (escucha 'cash.sale').
        this.emitter.emit('cash.sale', { placeId, receiptId: receipt.id, userId, lines: (receipt.items ?? []).map((i) => ({ dishId: i.dishId, quantity: i.quantity })) });
        return { ...receipt, code: receiptCode(receipt.series, receipt.number) };
    }

    /** Citas de hoy que todavía no se cobraron (rubros con agenda). */
    private async appointmentsToCharge(placeId: string) {
        return this.dataSource.query(
            `SELECT a.id, a.service_name AS "serviceName", a.price, a.starts_at AS "startsAt", a.customer_name AS "customerName",
                    a.status, p.name AS "professionalName", p.station
             FROM wuarike_db.appointments a JOIN wuarike_db.place_professionals p ON p.id = a.professional_id
             WHERE a.place_id = $1 AND a.receipt_id IS NULL AND a.status IN ('RESERVADA', 'ATENDIDA')
               AND (a.starts_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date
             ORDER BY a.starts_at`,
            [placeId],
        ).catch(() => []);
    }

    /** Bloquea la caja hasta el fin de la transacción y confirma que siga abierta (pudo cerrarse mientras tanto). */
    private async lockOpen(em: EntityManager, sessionId: string) {
        const [row] = await em.query(`SELECT status FROM wuarike_db.cash_sessions WHERE id = $1 FOR UPDATE`, [sessionId]);
        if (row?.status !== 'ABIERTA') throw new BadRequestException('La caja se cerró. Ábrela de nuevo para cobrar');
    }

    private async pendingPrecuentas(placeId: string) {
        const tabs = await this.tabsRepo.find({ where: { placeId, status: In(['CUENTA_PEDIDA']) }, order: { billRequestedAt: 'ASC' } });
        const tables = tabs.length ? await this.tablesRepo.find({ where: { id: In(tabs.map((t) => t.tableId)) } }) : [];
        return Promise.all(tabs.map(async (tab) => ({
            tabId: tab.id, tableName: tables.find((t) => t.id === tab.tableId)?.name ?? 'Mesa',
            precuenta: tab.precuenta, requestedAt: tab.billRequestedAt, due: (await this.orders.tabTotal(tab.id)).due,
        })));
    }

    private async requireOpen(placeId: string) {
        const session = await this.sessionsRepo.findOne({ where: { placeId, status: 'ABIERTA' } });
        if (!session) throw new BadRequestException('Primero abre la caja');
        return session;
    }

    private sum(receipts: Receipt[]): CashTotals {
        const totals: CashTotals = { EFECTIVO: 0, TARJETA: 0, YAPE_PLIN: 0, count: receipts.length };
        for (const r of receipts) totals[r.paymentMethod] += r.total;
        return totals;
    }

    private clean(dto: PrecuentaDto) {
        const trim = (v?: string) => v?.trim() || undefined;
        return {
            docType: dto.docType, customerDocType: trim(dto.customerDocType), customerDocNumber: trim(dto.customerDocNumber)?.toUpperCase(),
            customerName: trim(dto.customerName), customerAddress: trim(dto.customerAddress),
        };
    }
}
