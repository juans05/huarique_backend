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
import { User } from '../../users/entities/user.entity';

@Entity('place_photos')
export class PlacePhoto {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    url: string;

    @Column({ name: 'place_id' })
    @Index()
    placeId: string;

    @ManyToOne(() => Place, (place) => place.photos, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'user_id' })
    @Index()
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
