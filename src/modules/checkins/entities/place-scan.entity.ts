import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('place_scans')
export class PlaceScan {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @Column({ name: 'device_id', nullable: true })
    deviceId: string | null;

    @Column({ default: 'qr' })
    source: 'nfc' | 'qr' | 'direct';

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
