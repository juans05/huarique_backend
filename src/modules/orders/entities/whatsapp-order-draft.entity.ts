import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';
import { Fulfillment } from './order.entity';

export interface DraftItem { dishId: string; name: string; unitPrice: number; quantity: number; note?: string }

@Entity('whatsapp_order_drafts')
export class WhatsappOrderDraft {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column({ name: 'customer_phone' }) customerPhone: string;
    @Column({ name: 'whatsapp_number_id', type: 'uuid', nullable: true }) whatsappNumberId: string | null;
    @Column({ name: 'items_json', type: 'jsonb', default: [] }) items: DraftItem[];
    @Column({ type: 'varchar', nullable: true }) fulfillment: Fulfillment | null;
    @Column({ name: 'delivery_address', type: 'text', nullable: true }) deliveryAddress: string | null;
    @Column({ default: 'ARMANDO' }) status: 'ARMANDO' | 'CONFIRMADO' | 'EXPIRADO';
    @Column({ name: 'order_id', type: 'uuid', nullable: true }) orderId: string | null;
    @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
