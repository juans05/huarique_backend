import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('ubigeos')
@Index(['department', 'province', 'district']) // Composite index for search performance
export class Ubigeo {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    @Index()
    department: string;

    @Column()
    @Index()
    province: string;

    @Column()
    @Index()
    district: string;

    @Column({ name: 'ubigeo_code', unique: true })
    ubigeoCode: string; // 6 digits: DD PP DD (e.g., 150101)

    @Column({ type: 'decimal', nullable: true })
    latitude: number;

    @Column({ type: 'decimal', nullable: true })
    longitude: number;
}
