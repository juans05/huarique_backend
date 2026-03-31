import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('user_streaks')
export class UserStreak {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', unique: true })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'current_streak', type: 'int', default: 0 })
    currentStreak: number;

    @Column({ name: 'longest_streak', type: 'int', default: 0 })
    longestStreak: number;

    @Column({ name: 'last_checkin_date', type: 'date', nullable: true })
    lastCheckinDate: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
