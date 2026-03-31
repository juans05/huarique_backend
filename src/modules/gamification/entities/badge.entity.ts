import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    OneToMany,
} from 'typeorm';
import { UserBadge } from './user-badge.entity';

@Entity('badges')
export class Badge {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ name: 'icon_url', nullable: true })
    iconUrl: string;

    @Column({ type: 'json', nullable: true })
    criteria: any;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @OneToMany(() => UserBadge, (userBadge) => userBadge.badge)
    userBadges: UserBadge[];
}
