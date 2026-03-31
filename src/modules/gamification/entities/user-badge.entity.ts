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
import { Badge } from './badge.entity';

@Entity('user_badges')
@Unique(['userId', 'badgeId'])
export class UserBadge {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id' })
    userId: string;

    @ManyToOne(() => User, (user) => user.badges, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'badge_id' })
    badgeId: string;

    @ManyToOne(() => Badge, (badge) => badge.userBadges, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'badge_id' })
    badge: Badge;

    @CreateDateColumn({ name: 'earned_at' })
    earnedAt: Date;
}
