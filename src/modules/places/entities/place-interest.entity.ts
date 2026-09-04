import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Place } from './place.entity';

// "Quiero ir" — distinto de favorito: favorito es "me gusta", esto es intención
// real de visitar. Mismo shape que FavoritePlace a propósito.
@Entity('place_interests')
@Unique(['userId', 'placeId'])
export class PlaceInterest {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
