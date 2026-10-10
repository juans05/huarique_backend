import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('commission_payouts')
export class CommissionPayout {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'sales_user_id', type: 'uuid' })
    salesUserId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'sales_user_id' })
    salesUser: User;

    @Column({ type: 'varchar', length: 7 })
    period: string;

    @Column({ name: 'total_amount', type: 'int' })
    totalAmount: number;

    @Column({ type: 'varchar', default: 'pending' })
    status: 'pending' | 'paid';

    @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
    paidAt: Date | null;

    @Column({ name: 'paid_by_user_id', type: 'uuid', nullable: true })
    paidByUserId: string | null;

    @Column({ type: 'text', nullable: true })
    note: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
