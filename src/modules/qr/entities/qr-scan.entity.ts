import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { QrCode } from './qr-code.entity';
import { QrAssignment } from './qr-assignment.entity';

@Entity('qr_scans')
export class QrScan {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'qr_code_id' })
    @Index()
    qrCodeId: string;

    @ManyToOne(() => QrCode)
    @JoinColumn({ name: 'qr_code_id' })
    qrCode: QrCode;

    // Null si escanearon el QR antes de que estuviera asignado.
    @Column({ name: 'assignment_id', nullable: true })
    assignmentId: string | null;

    @ManyToOne(() => QrAssignment)
    @JoinColumn({ name: 'assignment_id' })
    assignment: QrAssignment | null;

    @Column({ name: 'place_id', nullable: true })
    @Index()
    placeId: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
