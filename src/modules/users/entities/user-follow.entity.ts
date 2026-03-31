import { Entity, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Unique, Column } from 'typeorm';
import { User } from './user.entity';

@Entity('user_follows')
@Unique(['followerId', 'followingId'])
export class UserFollow {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'follower_id' })
    followerId: string;

    @ManyToOne(() => User, (user) => user.following, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'follower_id' })
    follower: User;

    @Column({ name: 'following_id' })
    followingId: string;

    @ManyToOne(() => User, (user) => user.followers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'following_id' })
    following: User;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
