import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Place } from '../../places/entities/place.entity';

@Entity('whatsapp_numbers')
export class WhatsAppNumber {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'phone_number' })
    phoneNumber: string;

    @Column({ name: 'phone_number_id' })
    phoneNumberId: string;

    @Column({ name: 'whatsapp_api_token', type: 'text' })
    whatsappApiToken: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({
        type: 'enum',
        enum: ['UNVERIFIED', 'VERIFYING', 'VERIFIED', 'FAILED'],
        default: 'UNVERIFIED',
        name: 'verification_status'
    })
    verificationStatus: 'UNVERIFIED' | 'VERIFYING' | 'VERIFIED' | 'FAILED';

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

}
