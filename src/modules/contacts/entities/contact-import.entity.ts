import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Place } from '../../places/entities/place.entity';

@Entity('contact_imports')
export class ContactImport {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column()
    filename: string;

    @Column({ name: 'total_rows', default: 0 })
    totalRows: number;

    @Column({ name: 'imported_rows', default: 0 })
    importedRows: number;

    @Column({ name: 'failed_rows', default: 0 })
    failedRows: number;

    @Column({ type: 'jsonb', nullable: true })
    errorLog: any;

    @Column({ type: 'jsonb', nullable: true })
    columnMapping: any;

    @Column({
        type: 'enum',
        enum: ['processing', 'completed', 'failed'],
        default: 'processing'
    })
    status: 'processing' | 'completed' | 'failed';

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
