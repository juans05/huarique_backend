import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

export type ReceiptDocType = 'TICKET' | 'BOLETA' | 'FACTURA';
export type CashMethod = 'EFECTIVO' | 'TARJETA' | 'YAPE_PLIN';
/** MESA: cuenta de mesa; VENTA: venta directa en mostrador; CITA: cobro de una cita de la agenda. */
export type ReceiptKind = 'MESA' | 'VENTA' | 'CITA';

/** Comprobante emitido en caja. Numeración interna por serie (no se envía a SUNAT). */
@Entity('receipts')
export class Receipt {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column({ name: 'cash_session_id' }) cashSessionId: string;
    @Column({ default: 'MESA' }) kind: ReceiptKind;
    @Column({ name: 'tab_id', type: 'uuid', nullable: true }) tabId: string | null;
    @Column({ name: 'appointment_id', type: 'uuid', nullable: true }) appointmentId: string | null;
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
    @OneToMany(() => ReceiptItem, (i) => i.receipt, { cascade: ['insert'] }) items?: ReceiptItem[];
}

/** Línea del comprobante (lo vendido): plato/producto/servicio del catálogo u "otro ítem". Montos en céntimos. */
@Entity('receipt_items')
export class ReceiptItem {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'receipt_id' }) receiptId: string;
    @ManyToOne(() => Receipt, (r) => r.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'receipt_id' })
    receipt: Receipt;
    @Column({ name: 'dish_id', type: 'uuid', nullable: true }) dishId: string | null;
    @Column() description: string;
    @Column({ type: 'int' }) quantity: number;
    @Column({ name: 'unit_price', type: 'int' }) unitPrice: number;
    @Column({ name: 'line_total', type: 'int' }) lineTotal: number;
}
