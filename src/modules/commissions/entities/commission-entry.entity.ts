import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Place } from '../../places/entities/place.entity';
import { decimalToNumber } from './commission-settings.entity';

export type CommissionType = 'first_month' | 'recurring' | 'clawback';

@Entity('commission_entries')
export class CommissionEntry {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'sales_user_id', type: 'uuid' })
    salesUserId: string;

    @Column({ name: 'place_id', type: 'uuid' })
    placeId: string;

    @ManyToOne(() => Place)
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'subscription_id', type: 'uuid' })
    subscriptionId: string;

    @Column({ name: 'payment_id', type: 'uuid' })
    paymentId: string;

    @Column({ type: 'varchar' })
    type: CommissionType;

    @Column({ name: 'month_number', type: 'int' })
    monthNumber: number;

    @Column({ name: 'base_amount', type: 'int' })
    baseAmount: number;

    @Column({ type: 'numeric', precision: 5, scale: 4, transformer: decimalToNumber })
    rate: number;

    @Column({ type: 'int' })
    amount: number;

    @Column({ name: 'payout_id', type: 'uuid', nullable: true })
    payoutId: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
