import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { NowPost } from './now-post.entity';

export type NowReactionType = 'like' | 'dislike' | 'check';

@Entity('now_reactions')
@Unique('uq_now_reactions_post_user', ['postId', 'userId'])
export class NowReaction {
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

    @Column({ type: 'varchar', length: 10 })
    type: NowReactionType;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
