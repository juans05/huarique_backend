import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('spain_locations')
@Index(['community', 'province'])
export class SpainLocation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    @Index()
    community: string;

    @Column()
    province: string;

    @Column()
    municipality: string;
}
