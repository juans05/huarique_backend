import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type TabStatus = 'ABIERTA' | 'CUENTA_PEDIDA' | 'PAGADA' | 'CERRADA';
/** Datos del comprobante que el mozo pide junto con la precuenta; caja los usa al cobrar. */
export type Precuenta = { docType: 'TICKET' | 'BOLETA' | 'FACTURA'; customerDocType?: string; customerDocNumber?: string; customerName?: string; customerAddress?: string };

@Entity('tabs')
export class Tab {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column({ name: 'table_id' }) tableId: string;
    @Column({ default: 'ABIERTA' }) status: TabStatus;
    @Column({ name: 'public_token', unique: true }) publicToken: string;
    @Column({ name: 'opened_at', type: 'timestamptz', default: () => 'now()' }) openedAt: Date;
    @Column({ name: 'bill_requested_at', type: 'timestamptz', nullable: true }) billRequestedAt: Date | null;
    @Column({ name: 'closed_at', type: 'timestamptz', nullable: true }) closedAt: Date | null;
    @Column({ type: 'jsonb', nullable: true }) precuenta: Precuenta | null;
}
