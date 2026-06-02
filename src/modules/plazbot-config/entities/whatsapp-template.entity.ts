import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type TemplateStatus = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'FAILED';

@Entity('whatsapp_templates')
export class WhatsAppTemplate {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;

    @Column()
    category: string;

    @Column({ name: 'language_code', default: 'es' })
    languageCode: string;

    @Column({ name: 'header_text', nullable: true })
    headerText: string | null;

    @Column({ type: 'text' })
    body: string;

    @Column({ nullable: true })
    footer: string | null;

    @Column({ type: 'jsonb', default: '[]' })
    buttons: any[];

    @Column({ name: 'variable_samples', type: 'jsonb', nullable: true })
    variableSamples: Record<number, { value: string; type: string }> | null;

    @Column({
        type: 'enum',
        enum: ['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'FAILED'],
        default: 'PENDING',
    })
    status: TemplateStatus;

    @Column({ name: 'plazbot_template_id', nullable: true })
    plazbotTemplateId: string | null;

    @Column({ name: 'error_message', type: 'text', nullable: true })
    errorMessage: string | null;

    @Column({ name: 'plazbot_response', type: 'jsonb', nullable: true })
    plazbotResponse: any;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
