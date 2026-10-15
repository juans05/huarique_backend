import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { PaymentDestination } from './place-order-settings.entity';

export type PaymentMethod = 'ONLINE' | 'TARJETA' | 'YAPE' | 'PAGOEFECTIVO' | 'EFECTIVO' | 'POS';
export type PaymentStatus = 'PENDIENTE' | 'PROCESANDO' | 'PAGADO' | 'FALLIDO' | 'EXPIRADO';

@Entity('order_payments')
export class OrderPayment {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column({ name: 'order_id', type: 'uuid', nullable: true }) orderId: string | null;
    @Column({ name: 'tab_id', type: 'uuid', nullable: true }) tabId: string | null;
    @Column() method: PaymentMethod;
    @Column({ type: 'int' }) amount: number;
    @Column() status: PaymentStatus;
    @Column() destination: PaymentDestination;
    @Column({ name: 'customer_email', type: 'varchar', nullable: true }) customerEmail: string | null;
    @Column({ name: 'culqi_charge_id', type: 'varchar', nullable: true, unique: true }) culqiChargeId: string | null;
    @Column({ name: 'culqi_order_id', type: 'varchar', nullable: true, unique: true }) culqiOrderId: string | null;
    @Column({ name: 'culqi_fee', type: 'int', default: 0 }) culqiFee: number;
    @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt: Date | null;
    @Column({ name: 'paid_at', type: 'timestamptz', nullable: true }) paidAt: Date | null;
    /** Cuándo payWithToken reclamó el pago (PENDIENTE→PROCESANDO); la conciliación revisa los atascados. */
    @Column({ name: 'processing_started_at', type: 'timestamptz', nullable: true }) processingStartedAt: Date | null;
    @Column({ name: 'recorded_by_user_id', type: 'uuid', nullable: true }) recordedByUserId: string | null;
    @Column({ name: 'payout_id', type: 'uuid', nullable: true }) payoutId: string | null;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
