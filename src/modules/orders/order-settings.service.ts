import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlaceOrderSettings } from './entities/place-order-settings.entity';
import { PlaceTable } from './entities/place-table.entity';
import { TableDto, UpdateOrderSettingsDto, UpdateTableDto } from './dto/order-settings.dto';
import { newPublicToken, newTablePin } from './order-rules';

const DEFAULTS: Omit<PlaceOrderSettings, 'placeId' | 'updatedAt'> = {
    ordersEnabled: false, tablePaymentMode: 'CUENTA_ABIERTA', paymentDestination: 'LOCAL', culqiPublicKey: null, culqiSecretKey: null,
    pickupEnabled: true, deliveryEnabled: false, deliveryFee: 0, deliveryNote: null, prepTimeMin: 20, pricesIncludeIgv: true,
    cashPaymentEnabled: true, wuarikesCommissionPct: 0.05,
};

@Injectable()
export class OrderSettingsService {
    constructor(
        @InjectRepository(PlaceOrderSettings) private settingsRepo: Repository<PlaceOrderSettings>,
        @InjectRepository(PlaceTable) private tablesRepo: Repository<PlaceTable>,
        private config: ConfigService,
    ) { }

    async getForAdmin(placeId: string) {
        return this.toView(await this.load(placeId));
    }

    async update(placeId: string, dto: UpdateOrderSettingsDto) {
        const current = await this.load(placeId);
        const { culqiSecretKey, ...rest } = dto;
        const next: PlaceOrderSettings = { ...current, ...rest };
        if (culqiSecretKey) next.culqiSecretKey = culqiSecretKey.trim();
        // El modo WUARIKES queda bloqueado hasta su validación legal y de Culqi (ver spec, "Riesgo regulatorio").
        if (dto.paymentDestination === 'WUARIKES') throw new BadRequestException('El cobro a través de Wuarikes todavía no está disponible');
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
