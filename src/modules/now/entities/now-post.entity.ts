import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { NowVisibility } from '../now-rules';

export type NowPostKind = 'photo' | 'video' | 'text';

@Entity('now_posts')
@Index('idx_now_posts_author_created', ['authorId', 'createdAt'])
export class NowPost {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'author_id' })
    authorId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'author_id' })
    author: User;

    @Column({ type: 'varchar', length: 10 })
    kind: NowPostKind;

    @Column({ type: 'varchar', length: 500, nullable: true })
    text: string | null;

    @Column({ name: 'media_url', type: 'varchar', nullable: true })
    mediaUrl: string | null;

    @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
    @Index('idx_now_posts_location', { spatial: true })
    location: any;

    @Column({ type: 'double precision' })
    latitude: number;

    @Column({ type: 'double precision' })
    longitude: number;

    @Column({ type: 'varchar', length: 10, default: 'all' })
    visibility: NowVisibility;

    @Column({ type: 'int', default: 0 })
    likes: number;

    @Column({ type: 'int', default: 0 })
    dislikes: number;

    @Column({ type: 'int', default: 0 })
    checks: number;

    @Column({ type: 'int', default: 0 })
    reports: number;

    @Column({ default: false })
    hidden: boolean;

    @Column({ name: 'hidden_reason', type: 'varchar', length: 20, nullable: true })
    hiddenReason: string | null;

    @Column({ name: 'expires_at', type: 'timestamptz' })
    @Index('idx_now_posts_expires_at')
    expiresAt: Date;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
