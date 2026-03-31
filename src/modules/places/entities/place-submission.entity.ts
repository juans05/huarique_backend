import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Category } from './category.entity';

@Entity('place_submissions')
export class PlaceSubmission {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'submitted_by_user_id' })
    submittedByUserId: string;

    @ManyToOne(() => User, (user) => user.submissions)
    @JoinColumn({ name: 'submitted_by_user_id' })
    submittedBy: User;

    @Column()
    name: string;

    @Column({ name: 'name_normalized' })
    nameNormalized: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ name: 'category_id' })
    categoryId: string;

    @ManyToOne(() => Category)
    @JoinColumn({ name: 'category_id' })
    category: Category;

    @Column()
    district: string;

    @Column({ type: 'text', nullable: true })
    address: string;

    @Column({ type: 'decimal', precision: 10, scale: 8 })
    latitude: number;

    @Column({ type: 'decimal', precision: 11, scale: 8 })
    longitude: number;

    @Column({ nullable: true })
    phone: string;

    @Column({ nullable: true })
    website: string;

    @Column({ name: 'cover_image_url', nullable: true })
    coverImageUrl: string;

    @Column({ default: 'pending' })
    status: 'pending' | 'approved' | 'rejected';

    @Column({ name: 'reviewed_by_admin_id', nullable: true })
    reviewedByAdminId: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'reviewed_by_admin_id' })
    reviewedBy: User;

    @Column({ name: 'reviewed_at', nullable: true })
    reviewedAt: Date;

    @Column({ name: 'rejection_reason', type: 'text', nullable: true })
    rejectionReason: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
