import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { QrCode } from './qr-code.entity';
import { Place } from '../../places/entities/place.entity';
import { User } from '../../users/entities/user.entity';

export enum QrDestinationType {
    REPUTATION = 'REPUTATION',
    MENU = 'MENU',
    CUSTOM_URL = 'CUSTOM_URL',
}

// A qué apunta un QrCode. La asignación activa es la fila con unassignedAt
// NULL (a lo sumo una por qr_code_id — ver índice único parcial en la
// migración). Reasignar = cerrar la activa + crear una nueva: así el
// historial completo queda gratis, sin tabla aparte.
@Entity('qr_assignments')
export class QrAssignment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'qr_code_id' })
    @Index()
    qrCodeId: string;

    @ManyToOne(() => QrCode)
    @JoinColumn({ name: 'qr_code_id' })
    qrCode: QrCode;

    @Column({ name: 'place_id' })
    @Index()
    placeId: string;

    @ManyToOne(() => Place)
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'destination_type', type: 'varchar', length: 20 })
    destinationType: QrDestinationType;

    @Column({ name: 'destination_url', type: 'text', nullable: true })
    destinationUrl: string | null;

    @CreateDateColumn({ name: 'assigned_at' })
    assignedAt: Date;

    @Column({ name: 'unassigned_at', type: 'timestamp', nullable: true })
    unassignedAt: Date | null;

    @Column({ name: 'assigned_by' })
    assignedBy: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'assigned_by' })
    assignedByUser: User;

    @Column({ type: 'text', nullable: true })
    reason: string | null;
}
