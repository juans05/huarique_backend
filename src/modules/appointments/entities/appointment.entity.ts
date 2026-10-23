import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type AppointmentStatus = 'RESERVADA' | 'ATENDIDA' | 'NO_ASISTIO' | 'CANCELADA';
export type AppointmentSource = 'PANEL' | 'BOT' | 'WEB';

@Entity('appointments')
export class Appointment {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column({ name: 'professional_id' }) professionalId: string;
    @Column({ name: 'service_id', type: 'uuid', nullable: true }) serviceId: string | null;
    @Column({ name: 'service_name' }) serviceName: string;
    @Column({ name: 'duration_min', type: 'int' }) durationMin: number;
    /** Céntimos. */
    @Column({ type: 'int', default: 0 }) price: number;
    @Column({ name: 'starts_at', type: 'timestamptz' }) startsAt: Date;
    @Column({ name: 'ends_at', type: 'timestamptz' }) endsAt: Date;
    @Column({ name: 'customer_name' }) customerName: string;
    @Column({ name: 'customer_phone', type: 'varchar', nullable: true }) customerPhone: string | null;
    @Column({ type: 'varchar', nullable: true }) notes: string | null;
    @Column({ default: 'RESERVADA' }) status: AppointmentStatus;
    @Column({ default: 'PANEL' }) source: AppointmentSource;
    @Column({ name: 'public_token', unique: true }) publicToken: string;
    @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true }) createdByUserId: string | null;
    /** Comprobante con el que se cobró en caja (null = por cobrar). */
    @Column({ name: 'receipt_id', type: 'uuid', nullable: true }) receiptId: string | null;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

/** Lo que el cliente va eligiendo por WhatsApp hasta confirmar la cita. */
@Entity('appointment_drafts')
export class AppointmentDraft {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column({ name: 'customer_phone' }) customerPhone: string;
    @Column({ name: 'service_id', type: 'uuid', nullable: true }) serviceId: string | null;
    /** id del profesional, 'any' = cualquiera, null = todavía no elige. */
    @Column({ name: 'professional_id', type: 'varchar', nullable: true }) professionalId: string | null;
    /** YYYY-MM-DD (Lima). */
    @Column({ type: 'varchar', nullable: true }) date: string | null;
    /** HH:MM (Lima). */
    @Column({ type: 'varchar', nullable: true }) time: string | null;
    @Column({ default: 'ARMANDO' }) status: 'ARMANDO' | 'CONFIRMADO' | 'EXPIRADO';
    @Column({ name: 'appointment_id', type: 'uuid', nullable: true }) appointmentId: string | null;
    @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
