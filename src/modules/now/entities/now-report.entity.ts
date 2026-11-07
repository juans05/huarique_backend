import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { NowPost } from './now-post.entity';

@Entity('now_reports')
@Unique('uq_now_reports_post_user', ['postId', 'userId'])
@Index('idx_now_reports_user_created', ['userId', 'createdAt'])
export class NowReport {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'post_id' })
    postId: string;

    @ManyToOne(() => NowPost, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'post_id' })
    post: NowPost;

    @Column({ name: 'user_id' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ type: 'varchar', length: 200, nullable: true })
    reason: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
