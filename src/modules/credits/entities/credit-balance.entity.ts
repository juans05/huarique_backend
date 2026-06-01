import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Place } from '../../places/entities/place.entity';

@Entity('credit_balances')
export class CreditBalance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id', unique: true })
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ default: 0 })
    balance: number;

    @Column({ name: 'total_purchased', default: 0 })
    totalPurchased: number;

    @Column({ name: 'total_used', default: 0 })
    totalUsed: number;

    @Column({ name: 'alert_threshold', default: 100 })
    alertThreshold: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
