import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { PlaceTeamRole } from './place-team-member.entity';

/** Perfil del equipo de un negocio: nivel base para las acciones y secciones del panel que puede usar. */
@Entity('place_team_profiles')
export class PlaceTeamProfile {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @Column({ length: 60 })
    name: string;

    @Column({ name: 'base_role', type: 'varchar', length: 20 })
    baseRole: PlaceTeamRole;

    @Column({ type: 'text', array: true, default: '{}' })
    modules: string[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
