import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('credit_transactions')
@Index(['placeId', 'createdAt'])
export class CreditTransaction {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    @Index()
    placeId: string;

    @Column({
        type: 'enum',
        enum: ['purchase', 'usage', 'refund', 'bonus'],
    })
    type: 'purchase' | 'usage' | 'refund' | 'bonus';

    @Column({ type: 'int' })
    amount: number;

    @Column({ name: 'balance_after', nullable: true })
    balanceAfter: number;

    @Column({ name: 'reference_type', nullable: true })
    referenceType: string;

    @Column({ name: 'reference_id', nullable: true })
    referenceId: string;

    @Column({ nullable: true })
    description: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
