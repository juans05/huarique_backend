import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('user_points_log')
export class UserPointsLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column()
    points: number;

    @Column({ length: 100 })
    reason: string; // 'checkin', 'checkin_with_photo', 'like_received', 'place_approved'

    @Column({ name: 'reference_id', nullable: true })
    referenceId: string; // checkin_id, submission_id, etc.

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
