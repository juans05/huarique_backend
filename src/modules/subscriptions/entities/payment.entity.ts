import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Subscription } from './subscription.entity';

@Entity('subscription_payments')
export class Payment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'subscription_id' })
    subscriptionId: string;

    @ManyToOne(() => Subscription, (sub) => sub.payments)
    @JoinColumn({ name: 'subscription_id' })
    subscription: Subscription;

    @Column({ name: 'user_id' })
    userId: string;

    @Column({ name: 'culqi_charge_id', nullable: true })
    culqiChargeId: string;

    @Column({ type: 'int' })
    amount: number; // centavos

    @Column({ default: 'PEN' })
    currency: string;

    @Column({ default: 'paid' })
    status: string; // 'paid' | 'failed' | 'pending'

    @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
    paidAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
