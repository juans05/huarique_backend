import {
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    CreateDateColumn,
    Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Checkin } from '../../checkins/entities/checkin.entity';

@Entity('checkin_likes')
@Index(['user', 'checkin'], { unique: true }) // Un usuario solo puede dar like una vez por checkin
export class CheckinLike {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    user: User;

    @ManyToOne(() => Checkin, (checkin) => checkin.likes, { onDelete: 'CASCADE' })
    checkin: Checkin;

    @CreateDateColumn()
    createdAt: Date;
}