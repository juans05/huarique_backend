import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Mission } from './mission.entity';

@Entity('user_missions')
@Index(['userId', 'missionId', 'expiresAt'], { unique: true })
export class UserMission {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'mission_id' })
    missionId: string;

    @ManyToOne(() => Mission, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'mission_id' })
    mission: Mission;

    @Column({ type: 'int', default: 0 })
    progress: number;

    @Column({ type: 'int' })
    target: number;

    @Column({
        type: 'enum',
        enum: ['active', 'completed', 'claimed'],
        default: 'active',
    })
    status: string;

    @Column({ name: 'expires_at', type: 'timestamp' })
    expiresAt: Date;

    @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
    completedAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
