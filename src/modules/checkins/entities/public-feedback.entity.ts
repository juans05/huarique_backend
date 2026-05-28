import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Place } from '../../places/entities/place.entity';

@Entity('public_feedback')
export class PublicFeedback {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place)
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ type: 'int' })
    rating: number;

    @Column({ type: 'text', nullable: true })
    comment: string;

    @Column({ name: 'customer_name', nullable: true })
    customerName: string;

    @Column({ name: 'customer_contact', nullable: true })
    customerContact: string;

    @Column({ name: 'device_id', nullable: true })
    deviceId?: string;

    @Column({ default: 'pending' })
    status: 'pending' | 'resolved' | 'contacted';

    @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
    resolvedAt: Date;

    @Column({ name: 'admin_notes', type: 'text', nullable: true })
    adminNotes: string;

    @Column({ name: 'marketing_consent', default: false })
    marketingConsent: boolean;

    @Column({ name: 'consent_timestamp', type: 'timestamp', nullable: true })
    consentTimestamp: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
