import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Place } from '../../places/entities/place.entity';

@Entity('contacts')
export class Contact {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    @Index()
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    @Index()
    phone: string;

    @Column({ nullable: true })
    email: string;

    @Column({ type: 'jsonb', nullable: true })
    customFields: any;

    @Column({
        type: 'enum',
        enum: ['whatsapp', 'feedback', 'import'],
        default: 'import'
    })
    @Index()
    source: 'whatsapp' | 'feedback' | 'import';

    @Column({ name: 'import_batch_id', nullable: true })
    importBatchId: string;

    @Column({ type: 'jsonb', nullable: true })
    tags: string[];

    @Column({ name: 'marketing_consent', default: false })
    marketingConsent: boolean;

    @Column({ name: 'last_contacted_at', type: 'timestamp', nullable: true })
    lastContactedAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
