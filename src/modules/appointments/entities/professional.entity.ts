import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type DayHours = { day: string; open: string; close: string };

/** Persona que atiende (barbero, estilista, veterinario...). La silla o puesto es solo un dato visible. */
@Entity('place_professionals')
export class Professional {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column() name: string;
    @Column({ name: 'photo_url', type: 'varchar', nullable: true }) photoUrl: string | null;
    @Column({ type: 'varchar', nullable: true }) station: string | null;
    /** Servicios (dishes de tipo servicio) que hace; vacío = todos. */
    @Column({ name: 'service_ids', type: 'uuid', array: true, default: () => "'{}'" }) serviceIds: string[];
    /** Horario propio; null = horario del local. */
    @Column({ type: 'jsonb', nullable: true }) schedule: DayHours[] | null;
    @Column({ name: 'days_off', type: 'date', array: true, default: () => "'{}'" }) daysOff: string[];
    @Column({ name: 'team_user_id', type: 'uuid', nullable: true }) teamUserId: string | null;
    @Column({ default: true }) active: boolean;
    @Column({ name: 'display_order', type: 'int', default: 0 }) displayOrder: number;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
