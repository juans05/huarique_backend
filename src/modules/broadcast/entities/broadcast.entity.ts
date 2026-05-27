import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Place } from '../../places/entities/place.entity';
import { WhatsAppNumber } from '../../whatsapp/entities/whatsapp-number.entity';

@Entity('broadcasts')
export class Broadcast {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'whatsapp_number_id' })
    whatsappNumberId: string;

    @ManyToOne(() => WhatsAppNumber)
    @JoinColumn({ name: 'whatsapp_number_id' })
    whatsappNumber: WhatsAppNumber;

    @Column({ name: 'campaign_name' })
    campaignName: string;

    @Column({ type: 'text', name: 'template_body' })
    templateBody: string;

    @Column({ type: 'jsonb', name: 'segment_filter', nullable: true })
    segmentFilter: any;

    @Column({
        type: 'enum',
        enum: ['DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'FAILED'],
        default: 'DRAFT'
    })
    status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'FAILED';

    @Column({ name: 'messages_sent', default: 0 })
    messagesSent: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
