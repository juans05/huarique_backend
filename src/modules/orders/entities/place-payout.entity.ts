import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('place_payouts')
export class PlacePayout {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column() period: string;
    @Column({ type: 'int' }) gross: number;
    @Column({ type: 'int' }) commission: number;
    @Column({ name: 'culqi_fees', type: 'int' }) culqiFees: number;
    @Column({ type: 'int' }) net: number;
    @Column({ default: 'BORRADOR' }) status: 'BORRADOR' | 'PAGADO' | 'ANULADO';
    @Column({ name: 'paid_at', type: 'timestamptz', nullable: true }) paidAt: Date | null;
    @Column({ type: 'varchar', nullable: true }) reference: string | null;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
