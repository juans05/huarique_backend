import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DEFAULT_RECEIPT_SERIES, PlaceOrderSettings } from './entities/place-order-settings.entity';
import { PlaceTable } from './entities/place-table.entity';
import { BulkTablesDto, TableDto, UpdateOrderSettingsDto, UpdateTableDto } from './dto/order-settings.dto';
import { PlaceTeamService } from '../team/place-team.service';
import { SubscriptionTier } from '../subscriptions/subscriptions.service';
import { newPublicToken, newTablePin } from './order-rules';

const DEFAULTS: Omit<PlaceOrderSettings, 'placeId' | 'updatedAt'> = {
    ordersEnabled: false, tablePaymentMode: 'CUENTA_ABIERTA', paymentDestination: 'LOCAL', culqiPublicKey: null, culqiSecretKey: null,
    pickupEnabled: true, deliveryEnabled: false, deliveryFee: 0, deliveryNote: null, prepTimeMin: 20, pricesIncludeIgv: true,
    cashPaymentEnabled: true, tableOnlinePaymentEnabled: true, wuarikesCommissionPct: 0.05, receiptSeries: DEFAULT_RECEIPT_SERIES,
};

@Injectable()
export class OrderSettingsService {
    constructor(
        @InjectRepository(PlaceOrderSettings) private settingsRepo: Repository<PlaceOrderSettings>,
        @InjectRepository(PlaceTable) private tablesRepo: Repository<PlaceTable>,
        private config: ConfigService,
        private team: PlaceTeamService,
    ) { }

    async getForAdmin(placeId: string) {
        return { ...this.toView(await this.load(placeId)), plan: await this.planAccess(placeId) };
    }

    /** Qué canales permite el plan de la sede (la pantalla lo usa para explicar qué falta). */
    private async planAccess(placeId: string) {
        const has = (tier: SubscriptionTier) => this.team.assertPlaceTier(placeId, tier).then(() => true, () => false);
        const [table, whatsapp] = await Promise.all([has('fidelizacion'), has('ia_total')]);
        return { table, whatsapp };
    }

    async update(placeId: string, dto: UpdateOrderSettingsDto) {
        const current = await this.load(placeId);
        const { culqiSecretKey, ...rest } = dto;
        const next: PlaceOrderSettings = { ...current, ...rest };
        if (culqiSecretKey) next.culqiSecretKey = culqiSecretKey.trim();
        if (dto.ordersEnabled && !current.ordersEnabled && !(await this.planAccess(placeId)).table) {
            throw new ForbiddenException('Recibir pedidos está disponible desde el plan Wuarike Fidelización+');
        }
        // El modo WUARIKES queda bloqueado hasta su validación legal y de Culqi (ver spec, "Riesgo regulatorio").
        if (dto.paymentDestination === 'WUARIKES') throw new BadRequestException('El cobro a través de Wuarikes todavía no está disponible');
        if (dto.receiptSeries && new Set(Object.values(dto.receiptSeries)).size < 4) {
            throw new BadRequestException('No se pueden repetir las series');
        }
        // Prepago = el comensal paga online antes de que el pedido vaya a cocina: no existe sin pago desde el celular.
        if (next.tablePaymentMode === 'PREPAGO' && !next.tableOnlinePaymentEnabled) throw new BadRequestException('El modo prepago necesita que los clientes puedan pagar desde su celular');
        // Sin llaves se puede guardar igual (por ejemplo, para cobrar solo en efectivo/POS); la pantalla avisa con
        // culqiConfigured=false y PaymentsService rechaza el cobro online hasta que se registren.
        return this.toView(await this.settingsRepo.save(next));
    }

    async testCulqiKeys(placeId: string) {
        const settings = await this.load(placeId);
        if (!settings.culqiSecretKey) return { ok: false, message: 'Todavía no registraste tu llave secreta' };
        const res = await fetch('https://api.culqi.com/v2/charges?limit=1', { headers: { Authorization: `Bearer ${settings.culqiSecretKey}` } });
        return res.ok ? { ok: true, message: 'Llaves válidas' } : { ok: false, message: 'Culqi rechazó la llave secreta' };
    }

    listTables(placeId: string) {
        return this.tablesRepo.find({ where: { placeId }, order: { displayOrder: 'ASC', name: 'ASC' } });
    }

    async createTable(placeId: string, dto: TableDto) {
        const existing = await this.tablesRepo.find({ where: { placeId } });
        return this.tablesRepo.save(this.tablesRepo.create({ placeId, name: dto.name.trim(), capacity: dto.capacity ?? 4, displayOrder: existing.length, qrToken: newPublicToken(), pin: newTablePin(), active: true }));
    }

    /** Crea "Mesa 1" a "Mesa N" de una vez; salta los nombres que ya existen. */
    async createTables(placeId: string, dto: BulkTablesDto) {
        if (dto.to < dto.from) throw new BadRequestException('El número final debe ser mayor o igual al inicial');
        const prefix = (dto.prefix ?? 'Mesa').trim() || 'Mesa';
        const existing = await this.tablesRepo.find({ where: { placeId } });
        const taken = new Set(existing.map((t) => t.name.trim().toLowerCase()));
        const created: PlaceTable[] = [];
        for (let n = dto.from; n <= dto.to; n++) {
            const name = `${prefix} ${n}`;
            if (taken.has(name.toLowerCase())) continue;
            created.push(await this.tablesRepo.save(this.tablesRepo.create({
                placeId, name, capacity: dto.capacity ?? 4, displayOrder: existing.length + created.length,
                qrToken: newPublicToken(), pin: newTablePin(), active: true,
            })));
        }
        return created;
    }

    async updateTable(placeId: string, tableId: string, dto: UpdateTableDto) {
        const table = await this.tablesRepo.findOne({ where: { id: tableId, placeId } });
        if (!table) throw new NotFoundException('Mesa no encontrada');
        return this.tablesRepo.save({ ...table, ...dto });
    }

    /** Invalida el QR impreso (por ejemplo, si alguien se lo llevó). */
    async regenerateQr(placeId: string, tableId: string) {
        const table = await this.tablesRepo.findOne({ where: { id: tableId, placeId } });
        if (!table) throw new NotFoundException('Mesa no encontrada');
        return this.tablesRepo.save({ ...table, qrToken: newPublicToken() });
    }

    tableQrUrl(table: PlaceTable): string {
        const dashboard = this.config.get<string>('DASHBOARD_URL') || 'https://admin.wuarikes.com';
        return `${dashboard}/menu/${table.placeId}?mesa=${table.qrToken}`;
    }

    private async load(placeId: string): Promise<PlaceOrderSettings> {
        return (await this.settingsRepo.findOne({ where: { placeId } })) ?? ({ placeId, ...DEFAULTS } as PlaceOrderSettings);
    }

    private toView(settings: PlaceOrderSettings) {
        const { culqiSecretKey, ...rest } = settings;
        const api = this.config.get<string>('API_PUBLIC_URL') || 'https://backendwarike-production.up.railway.app';
        return {
            ...rest,
            culqiConfigured: !!(settings.culqiPublicKey && culqiSecretKey),
            culqiPublicKeyLast4: settings.culqiPublicKey ? settings.culqiPublicKey.slice(-4) : null,
            webhookUrl: `${api}/api/public/payments/culqi-webhook?place=${settings.placeId}`,
        };
    }
}
