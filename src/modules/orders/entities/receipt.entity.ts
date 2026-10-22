import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type ReceiptDocType = 'TICKET' | 'BOLETA' | 'FACTURA';
export type CashMethod = 'EFECTIVO' | 'TARJETA' | 'YAPE_PLIN';

/** Comprobante emitido en caja. Numeración interna por serie (no se envía a SUNAT). */
@Entity('receipts')
export class Receipt {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column({ name: 'cash_session_id' }) cashSessionId: string;
    @Column({ name: 'tab_id', type: 'uuid', nullable: true }) tabId: string | null;
    @Column({ name: 'table_name', type: 'varchar', nullable: true }) tableName: string | null;
    @Column({ name: 'payment_id', type: 'uuid', nullable: true }) paymentId: string | null;
    @Column({ name: 'doc_type' }) docType: ReceiptDocType;
    @Column() series: string;
    @Column({ type: 'int' }) number: number;
    @Column({ name: 'customer_doc_type', type: 'varchar', nullable: true }) customerDocType: string | null;
    @Column({ name: 'customer_doc_number', type: 'varchar', nullable: true }) customerDocNumber: string | null;
    @Column({ name: 'customer_name', type: 'varchar', nullable: true }) customerName: string | null;
    @Column({ name: 'customer_address', type: 'varchar', nullable: true }) customerAddress: string | null;
    @Column({ name: 'payment_method' }) paymentMethod: CashMethod;
    @Column({ type: 'int' }) total: number;
    @Column({ name: 'created_by_user_id' }) createdByUserId: string;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
