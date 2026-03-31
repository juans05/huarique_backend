import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Checkin } from '../../checkins/entities/checkin.entity';
import { UserFollow } from './user-follow.entity';
import { PlaceSubmission } from '../../places/entities/place-submission.entity';
import { UserBadge } from '../../gamification/entities/user-badge.entity';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    email: string;

    @Column({ name: 'password_hash' })
    @Exclude()
    passwordHash: string;

    @Column({ name: 'full_name' })
    fullName: string;

    @Column({ name: 'avatar_url', nullable: true })
    avatarUrl: string;

    @Column({ type: 'text', nullable: true })
    bio: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    pronouns: string; // Ej: "Él/He", "Ella/She", "Elle/They"

    @Column({ type: 'varchar', length: 20, nullable: true })
    gender: string; // Ej: "Masculino", "Femenino", "No binario"

    @Column({ name: 'birth_date', type: 'date', nullable: true })
    birthDate: Date;

    @Column({ default: 'user' })
    role: 'user' | 'admin' | 'business';

    @Column({ name: 'total_points', default: 0 })
    totalPoints: number;

    @Column({ name: 'current_level', default: 1 })
    currentLevel: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @Column({ name: 'last_login_at', nullable: true })
    lastLoginAt: Date;

    @OneToMany(() => Checkin, (checkin) => checkin.user)
    checkins: Checkin[];

    @OneToMany(() => PlaceSubmission, (submission) => submission.submittedBy)
    submissions: PlaceSubmission[];

    @OneToMany(() => UserBadge, (userBadge) => userBadge.user)
    badges: UserBadge[];

    @OneToMany(() => UserFollow, (follow) => follow.following)
    followers: UserFollow[];

    @OneToMany(() => UserFollow, (follow) => follow.follower)
    following: UserFollow[];

    // Auth & Verification Fields
    @Column({ name: 'is_verified', default: false })
    isVerified: boolean;

    @Column({ name: 'is_banned', default: false })
    isBanned: boolean;

    @Column({ name: 'verification_code', nullable: true })
    @Exclude()
    verificationCode: string;

    @Column({ name: 'verification_code_expires_at', nullable: true })
    @Exclude()
    verificationCodeExpiresAt: Date;

    @Column({ name: 'social_provider', nullable: true })
    socialProvider: string; // 'google', 'facebook', 'instagram'

    @Column({ name: 'social_id', nullable: true })
    @Exclude()
    socialId: string;
}
