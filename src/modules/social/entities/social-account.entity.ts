import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Place } from '../../places/entities/place.entity';

@Entity('social_accounts')
export class SocialAccount {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place)
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ default: 'instagram' })
    platform: 'instagram' | 'facebook' | 'tiktok';

    @Column({ name: 'platform_user_id', nullable: true })
    platformUserId: string;

    @Column({ name: 'platform_username', nullable: true })
    platformUsername: string;

    @Column({ name: 'access_token', type: 'text', nullable: true })
    accessToken: string;

    @Column({ name: 'token_expires_at', type: 'timestamp', nullable: true })
    tokenExpiresAt: Date;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
