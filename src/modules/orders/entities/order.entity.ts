import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { OrderItem } from './order-item.entity';

export type OrderStatus = 'PENDIENTE_PAGO' | 'NUEVO' | 'EN_PREPARACION' | 'LISTO' | 'ENTREGADO' | 'CANCELADO';
export type OrderChannel = 'MESA' | 'WHATSAPP';
export type Fulfillment = 'SALA' | 'RECOJO' | 'DELIVERY';

@Entity('orders')
export class Order {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ type: 'int' }) number: number;
    @Column({ name: 'place_id' }) placeId: string;
    @Column({ name: 'tab_id', type: 'uuid', nullable: true }) tabId: string | null;
    @Column({ name: 'table_id', type: 'uuid', nullable: true }) tableId: string | null;
    @Column() channel: OrderChannel;
    @Column() fulfillment: Fulfillment;
    @Column() status: OrderStatus;
    @Column({ name: 'customer_name', type: 'varchar', nullable: true }) customerName: string | null;
    @Column({ name: 'customer_phone', type: 'varchar', nullable: true }) customerPhone: string | null;
    @Column({ name: 'whatsapp_number_id', type: 'uuid', nullable: true }) whatsappNumberId: string | null;
    @Column({ name: 'delivery_address', type: 'text', nullable: true }) deliveryAddress: string | null;
    @Column({ name: 'delivery_reference', type: 'text', nullable: true }) deliveryReference: string | null;
    @Column({ type: 'int' }) subtotal: number;
    @Column({ name: 'delivery_fee', type: 'int', default: 0 }) deliveryFee: number;
    @Column({ type: 'int' }) total: number;
    @Column({ type: 'text', nullable: true }) notes: string | null;
    @Column({ name: 'public_token', unique: true }) publicToken: string;
    @Column({ name: 'paid_at', type: 'timestamptz', nullable: true }) paidAt: Date | null;
    @Column({ name: 'ready_at', type: 'timestamptz', nullable: true }) readyAt: Date | null;
    @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true }) deliveredAt: Date | null;
    @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true }) canceledAt: Date | null;
    @Column({ name: 'cancel_reason', type: 'text', nullable: true }) cancelReason: string | null;
    @Column({ name: 'refund_pending', default: false }) refundPending: boolean;
    @Column({ name: 'review_requested_at', type: 'timestamptz', nullable: true }) reviewRequestedAt: Date | null;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
    @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] }) items: OrderItem[];
}
