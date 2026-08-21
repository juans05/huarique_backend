import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { Place } from './place.entity';

@Entity('promotions')
export class Promotion {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 150 })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ name: 'image_url', type: 'text', nullable: true })
    imageUrl: string | null;

    @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
    startsAt: Date | null;

    @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
    endsAt: Date | null;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'place_id' })
    @Index()
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
