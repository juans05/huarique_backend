import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'order_id' }) orderId: string;
    @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'order_id' })
    order: Order;
    @Column({ name: 'dish_id', type: 'uuid', nullable: true }) dishId: string | null;
    @Column({ name: 'dish_name_snapshot' }) dishNameSnapshot: string;
    @Column({ name: 'unit_price', type: 'int' }) unitPrice: number;
    @Column({ type: 'int' }) quantity: number;
    @Column({ type: 'varchar', nullable: true }) note: string | null;
    @Column({ name: 'line_total', type: 'int' }) lineTotal: number;
}
