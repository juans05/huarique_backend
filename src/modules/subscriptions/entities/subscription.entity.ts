import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Payment } from './payment.entity';

@Entity('subscriptions')
export class Subscription {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id' })
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'culqi_subscription_id', nullable: true })
    culqiSubscriptionId: string;

    @Column({ name: 'culqi_customer_id', nullable: true })
    culqiCustomerId: string;

    @Column({ name: 'culqi_plan_id', nullable: true })
    culqiPlanId: string;

    @Column({ default: 'active' })
    status: string; // 'active' | 'past_due' | 'canceled'

    @Column({ name: 'amount', type: 'int', default: 9900 })
    amount: number; // centavos (9900 = S/.99)

    @Column({ default: 'PEN' })
    currency: string;

    @Column({ name: 'card_last4', nullable: true })
    cardLast4: string;

    @Column({ name: 'card_brand', nullable: true })
    cardBrand: string;

    @Column({ name: 'current_period_start', type: 'timestamptz', nullable: true })
    currentPeriodStart: Date;

    @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
    currentPeriodEnd: Date;

    @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true })
    canceledAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @OneToMany(() => Payment, (payment) => payment.subscription)
    payments: Payment[];
}
