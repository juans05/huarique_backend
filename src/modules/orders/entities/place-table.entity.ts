import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('place_tables')
export class PlaceTable {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column() name: string;
    @Column({ type: 'int', default: 4 }) capacity: number;
    @Column({ name: 'display_order', type: 'int', default: 0 }) displayOrder: number;
    @Column({ name: 'qr_token', unique: true }) qrToken: string;
    @Column({ default: true }) active: boolean;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
