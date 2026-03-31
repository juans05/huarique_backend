import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Checkin } from './checkin.entity';

@Entity('checkin_photos')
export class CheckinPhoto {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'checkin_id' })
    checkinId: string;

    @ManyToOne(() => Checkin, (checkin) => checkin.photos, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'checkin_id' })
    checkin: Checkin;

    @Column()
    url: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
