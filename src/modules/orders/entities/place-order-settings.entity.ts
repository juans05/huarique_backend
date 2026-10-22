import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';
import { encryptTransformer } from '../../../common/utils/encryption-transformer';

export type TablePaymentMode = 'CUENTA_ABIERTA' | 'PREPAGO';
export type PaymentDestination = 'LOCAL' | 'WUARIKES';
export type ReceiptSeries = { TICKET: string; BOLETA: string; FACTURA: string; NOTA_CREDITO: string };
export const DEFAULT_RECEIPT_SERIES: ReceiptSeries = { TICKET: 'T001', BOLETA: 'B001', FACTURA: 'F001', NOTA_CREDITO: 'FC01' };

const numeric = { to: (v: number) => v, from: (v: string) => parseFloat(v) };

@Entity('place_order_settings')
export class PlaceOrderSettings {
    @PrimaryColumn('uuid', { name: 'place_id' }) placeId: string;
    @Column({ name: 'orders_enabled', default: false }) ordersEnabled: boolean;
    @Column({ name: 'table_payment_mode', default: 'CUENTA_ABIERTA' }) tablePaymentMode: TablePaymentMode;
    @Column({ name: 'payment_destination', default: 'LOCAL' }) paymentDestination: PaymentDestination;
    @Column({ name: 'culqi_public_key', type: 'varchar', nullable: true }) culqiPublicKey: string | null;
    @Column({ name: 'culqi_secret_key_enc', type: 'text', nullable: true, transformer: encryptTransformer }) culqiSecretKey: string | null;
    @Column({ name: 'pickup_enabled', default: true }) pickupEnabled: boolean;
    @Column({ name: 'delivery_enabled', default: false }) deliveryEnabled: boolean;
    @Column({ name: 'delivery_fee', type: 'int', default: 0 }) deliveryFee: number;
    @Column({ name: 'delivery_note', type: 'text', nullable: true }) deliveryNote: string | null;
    @Column({ name: 'prep_time_min', type: 'int', default: 20 }) prepTimeMin: number;
    @Column({ name: 'prices_include_igv', default: true }) pricesIncludeIgv: boolean;
    @Column({ name: 'cash_payment_enabled', default: true }) cashPaymentEnabled: boolean;
    @Column({ name: 'wuarikes_commission_pct', type: 'numeric', precision: 5, scale: 4, default: 0.05, transformer: numeric }) wuarikesCommissionPct: number;
    @Column({ name: 'receipt_series', type: 'jsonb', default: () => `'${JSON.stringify(DEFAULT_RECEIPT_SERIES)}'` }) receiptSeries: ReceiptSeries;
    @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
