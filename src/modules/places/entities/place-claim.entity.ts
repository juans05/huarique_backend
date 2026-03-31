import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Place } from './place.entity';
import { User } from '../../users/entities/user.entity';

@Entity('place_claims')
export class PlaceClaim {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place)
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'user_id' })
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'business_name' })
    businessName: string;

    @Column({ name: 'business_email' })
    businessEmail: string;

    @Column({ name: 'business_phone' })
    businessPhone: string;

    @Column({ nullable: true })
    whatsapp: string;

    @Column({ name: 'verification_method', nullable: true })
    verificationMethod: string;

    @Column({ name: 'verification_code', nullable: true })
    verificationCode: string;

    @Column({ default: 'pending' })
    status: 'pending' | 'verified' | 'rejected';

    @Column({ name: 'verified_by_admin_id', nullable: true })
    verifiedByAdminId: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'verified_by_admin_id' })
    verifiedBy: User;

    @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
    verifiedAt: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
