import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Place } from '../../places/entities/place.entity';

@Entity('email_campaigns')
export class EmailCampaign {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'campaign_name' })
    campaignName: string;

    @Column()
    subject: string;

    @Column({ type: 'text', name: 'body_html' })
    bodyHtml: string;

    @Column({
        type: 'enum',
        enum: ['DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'FAILED'],
        default: 'DRAFT'
    })
    status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'FAILED';

    @Column({ name: 'emails_sent', default: 0 })
    emailsSent: number;

    @Column({ name: 'total_recipients', default: 0 })
    totalRecipients: number;

    @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true })
    scheduledAt: Date | null;

    @Column({ default: 'America/Lima' })
    timezone: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
