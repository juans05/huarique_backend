import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Place } from '../../places/entities/place.entity';
import { User } from '../../users/entities/user.entity';

@Entity('place_reports')
export class PlaceReport {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'reported_by_user_id' })
    reportedByUserId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'reported_by_user_id' })
    reportedBy: User;

    @Column({
        type: 'enum',
        enum: ['closed', 'wrong_location', 'wrong_info', 'duplicate', 'inappropriate'],
    })
    reason: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({
        type: 'enum',
        enum: ['pending', 'resolved', 'dismissed'],
        default: 'pending',
    })
    status: string;

    @Column({ name: 'resolved_by_admin_id', nullable: true })
    resolvedByAdminId: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'resolved_by_admin_id' })
    resolvedBy: User;

    @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
    resolvedAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
