import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum QrPhysicalType {
    QR = 'QR',
    NFC = 'NFC',
    TABLET = 'TABLET',
}

export enum QrCodeStatus {
    AVAILABLE = 'AVAILABLE',
    ASSIGNED = 'ASSIGNED',
    SUSPENDED = 'SUSPENDED',
    DISABLED = 'DISABLED',
}

// El QR físico, estable. A qué apunta vive en QrAssignment — nunca acá.
@Entity('qr_codes')
export class QrCode {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Token no-predecible, va en la URL pública /q/{token}.
    @Column({ unique: true })
    @Index()
    token: string;

    // Código legible impreso en la tarjeta, ej. "QR-000042".
    @Column({ unique: true })
    code: string;

    @Column({ name: 'physical_type', type: 'varchar', length: 10, default: QrPhysicalType.QR })
    physicalType: QrPhysicalType;

    @Column({ type: 'varchar', length: 12, default: QrCodeStatus.AVAILABLE })
    @Index()
    status: QrCodeStatus;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
