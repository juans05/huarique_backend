import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Perfil del equipo de Wuarikes: nombre y lista de permisos (ver permissions.ts). */
@Entity('platform_profiles')
export class PlatformProfile {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column() name: string;
    @Column({ type: 'varchar', nullable: true }) description: string | null;
    @Column({ type: 'text', array: true, default: () => "'{}'" }) permissions: string[];
    /** Plantilla de fábrica: no se borra (la de Administrador tampoco se edita). */
    @Column({ name: 'is_system', default: false }) isSystem: boolean;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
