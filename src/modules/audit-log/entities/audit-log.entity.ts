import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
@Index(['placeId', 'createdAt'])
@Index(['action'])
@Index(['entityType', 'entityId'])
export class AuditLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id', nullable: true })
    @Index()
    placeId: string;

    @Column({ name: 'user_id', nullable: true })
    userId: string;

    @Column()
    @Index()
    action: string;

    @Column({ name: 'entity_type', nullable: true })
    entityType: string;

    @Column({ name: 'entity_id', nullable: true })
    entityId: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: any;

    @Column({ name: 'ip_address', nullable: true })
    ipAddress: string;

    @Column({ nullable: true })
    description: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
