import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Place } from '../../places/entities/place.entity';
import { CheckinLike } from './checkin-like.entity';
import { CheckinPhoto } from './checkin-photo.entity';

@Entity('checkins')
export class Checkin {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id' })
    userId: string;

    @ManyToOne(() => User, (user) => user.checkins)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place, (place) => place.checkins)
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ length: 200, nullable: true })
    comment: string;

    @Column({ type: 'int', nullable: true })
    rating: number;

    @Column({ name: 'photo_url', nullable: true })
    photoUrl: string;

    @Column({ name: 'dish_name', length: 100, nullable: true })
    dishName: string;

    @Column({ name: 'dish_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
    dishPrice: number;

    @Column({ name: 'likes_count', default: 0 })
    likesCount: number;

    // Shadow-flagging: un check-in tramposo se guarda igual (para poder
    // auditarlo y para que el tramposo no note el bloqueo y busque la vuelta),
    // pero no suma puntos, no afecta el rating del local y no sale en el feed.
    @Column({ name: 'is_suspicious', default: false })
    isSuspicious: boolean;

    @Column({ name: 'suspicious_reason', length: 200, nullable: true })
    suspiciousReason: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @OneToMany(() => CheckinLike, (like) => like.checkin)
    likes: CheckinLike[];

    @OneToMany(() => CheckinPhoto, (photo) => photo.checkin)
    photos: CheckinPhoto[];
}
