import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('complaint_book_entries')
export class ComplaintBookEntry {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'sequence_number', type: 'bigint', generated: 'increment' })
    sequenceNumber: number;

    @Column()
    type: 'reclamo' | 'queja';

    @Column({ name: 'consumer_full_name' })
    consumerFullName: string;

    @Column({ name: 'consumer_document_type' })
    consumerDocumentType: 'DNI' | 'CE' | 'Pasaporte' | 'RUC';

    @Column({ name: 'consumer_document_number' })
    consumerDocumentNumber: string;

    @Column({ name: 'consumer_address' })
    consumerAddress: string;

    @Column({ name: 'consumer_email' })
    consumerEmail: string;

    @Column({ name: 'consumer_phone', nullable: true })
    consumerPhone: string;

    @Column({ name: 'contracted_good', type: 'text' })
    contractedGood: string;

    @Column({ name: 'claimed_amount', type: 'numeric', precision: 10, scale: 2, nullable: true })
    claimedAmount: number | null;

    @Column({ type: 'text' })
    detail: string;

    @Column({ name: 'consumer_request', type: 'text' })
    consumerRequest: string;

    @Column({ default: 'pending' })
    status: 'pending' | 'resolved';

    @Column({ name: 'provider_response', type: 'text', nullable: true })
    providerResponse: string | null;

    @Column({ name: 'responded_by_admin_id', nullable: true })
    respondedByAdminId: string | null;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'responded_by_admin_id' })
    respondedBy: User;

    @Column({ name: 'responded_at', type: 'timestamp', nullable: true })
    respondedAt: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
