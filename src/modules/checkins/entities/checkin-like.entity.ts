import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Checkin } from './checkin.entity';

@Entity('checkin_likes')
@Unique(['checkinId', 'userId'])
export class CheckinLike {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'checkin_id' })
    checkinId: string;

    @ManyToOne(() => Checkin, (checkin) => checkin.likes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'checkin_id' })
    checkin: Checkin;

    @Column({ name: 'user_id' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
