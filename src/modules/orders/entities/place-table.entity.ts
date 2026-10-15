import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('place_tables')
export class PlaceTable {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column() name: string;
    @Column({ type: 'int', default: 4 }) capacity: number;
    @Column({ name: 'display_order', type: 'int', default: 0 }) displayOrder: number;
    @Column({ name: 'qr_token', unique: true }) qrToken: string;
    // PIN que el personal da al grupo al sentarse; cambia solo al pagar la cuenta completa o al cerrar la mesa.
    @Column({ type: 'varchar', length: 4, nullable: true }) pin: string | null;
    @Column({ default: true }) active: boolean;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
