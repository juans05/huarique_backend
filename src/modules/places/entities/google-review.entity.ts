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

@Entity('google_reviews')
@Index(['placeId', 'authorName', 'time'], { unique: true })
export class GoogleReview {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'author_name' })
    authorName: string;

    @Column({ name: 'author_photo_url', nullable: true })
    authorPhotoUrl: string;

    @Column({ type: 'int' })
    rating: number;

    @Column({ type: 'text', nullable: true })
    text: string;

    @Column({ name: 'relative_time_description', nullable: true })
    relativeTimeDescription: string;

    @Column({ type: 'bigint', nullable: true })
    time: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
