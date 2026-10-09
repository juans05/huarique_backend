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

    @Column({ name: 'messages_failed', default: 0 })
    messagesFailed: number;

    /** Cuántos mensajes se encolaron: sirve para saber cuándo terminó la campaña. */
    @Column({ name: 'total_recipients', default: 0 })
    totalRecipients: number;

    /** Plantilla aprobada de WhatsApp (obligatoria para escribir fuera de las 24 h). */
    @Column({ name: 'template_name', type: 'varchar', nullable: true })
    templateName: string | null;

    @Column({ name: 'template_language', default: 'es' })
    templateLanguage: string;

    /** Valores de {{1}}, {{2}}…; admite {nombre}. */
    @Column({ name: 'body_variables', type: 'jsonb', nullable: true })
    bodyVariables: string[] | null;

    @Column({ name: 'csv_import_id', nullable: true })
    csvImportId: string;

    @Column({ name: 'use_csv_merge', default: false })
    useCsvMerge: boolean;

    @Column({ type: 'jsonb', name: 'merge_mapping', nullable: true })
    mergeMapping: any;

    @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true })
    scheduledAt: Date;

    @Column({ default: 'America/Lima' })
    timezone: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
