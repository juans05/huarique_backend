import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { CashSession, CashTotals } from './entities/cash-session.entity';
import { CashMethod, Receipt } from './entities/receipt.entity';
import { Tab } from './entities/tab.entity';
import { PlaceTable } from './entities/place-table.entity';
import { DEFAULT_RECEIPT_SERIES } from './entities/place-order-settings.entity';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { OrderEventsService } from './order-events.service';
import { ChargeDto, PrecuentaDto } from './dto/cash.dto';
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
        private dataSource: DataSource,
        private orders: OrdersService,
        private payments: PaymentsService,
        private events: OrderEventsService,
    ) { }

    /** Estado de la caja: turno abierto (o null), totales, precuentas por cobrar y comprobantes del turno. */
    async current(placeId: string) {
        const session = await this.sessionsRepo.findOne({ where: { placeId, status: 'ABIERTA' } });
        const pending = await this.pendingPrecuentas(placeId);
        if (!session) return { session: null, totals: null, pending, receipts: [] };
        const receipts = await this.receiptsRepo.find({ where: { cashSessionId: session.id }, order: { createdAt: 'DESC' } });
        return { session, totals: this.sum(receipts), pending, receipts: receipts.map((r) => ({ ...r, code: receiptCode(r.series, r.number) })) };
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
