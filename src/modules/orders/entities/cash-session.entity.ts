import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type CashSessionStatus = 'ABIERTA' | 'CERRADA';
/** Montos en céntimos por medio de pago, guardados al cerrar el turno. */
export type CashTotals = { EFECTIVO: number; TARJETA: number; YAPE_PLIN: number; count: number };

@Entity('cash_sessions')
export class CashSession {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column({ default: 'ABIERTA' }) status: CashSessionStatus;
    @Column({ name: 'opening_amount', type: 'int', default: 0 }) openingAmount: number;
    @Column({ name: 'opened_by_user_id' }) openedByUserId: string;
    @Column({ name: 'opened_at', type: 'timestamptz', default: () => 'now()' }) openedAt: Date;
    @Column({ name: 'closed_by_user_id', type: 'uuid', nullable: true }) closedByUserId: string | null;
    @Column({ name: 'closed_at', type: 'timestamptz', nullable: true }) closedAt: Date | null;
    @Column({ name: 'expected_cash', type: 'int', nullable: true }) expectedCash: number | null;
    @Column({ name: 'counted_cash', type: 'int', nullable: true }) countedCash: number | null;
    @Column({ type: 'jsonb', nullable: true }) totals: CashTotals | null;
}
