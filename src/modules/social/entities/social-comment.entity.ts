import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { SocialAccount } from './social-account.entity';

@Entity('social_comments')
export class SocialComment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'social_account_id' })
    socialAccountId: string;

    @ManyToOne(() => SocialAccount)
    @JoinColumn({ name: 'social_account_id' })
    socialAccount: SocialAccount;

    @Column({ name: 'platform_comment_id' })
    platformCommentId: string;

    @Column({ name: 'platform_post_id', nullable: true })
    platformPostId: string;

    @Column({ name: 'author_username' })
    authorUsername: string;

    @Column({ name: 'author_profile_pic', nullable: true })
    authorProfilePic: string;

    @Column({ type: 'text' })
    text: string;

    @Column({ name: 'sentiment', nullable: true })
    sentiment: 'positive' | 'negative' | 'neutral' | 'question';

    @Column({ name: 'ai_reply', type: 'text', nullable: true })
    aiReply: string;

    @Column({ name: 'ai_replied_at', type: 'timestamp', nullable: true })
    aiRepliedAt: Date;

    @Column({ name: 'is_replied', default: false })
    isReplied: boolean;

    @Column({ name: 'manual_reply', type: 'text', nullable: true })
    manualReply: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @Column({ name: 'platform_created_at', type: 'timestamp', nullable: true })
    platformCreatedAt: Date;
}
