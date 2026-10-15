import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Place } from '../../places/entities/place.entity';

export const PLACE_TEAM_ROLES = ['admin', 'supervisor', 'agente', 'mozo', 'cocina'] as const;
export type PlaceTeamRole = (typeof PLACE_TEAM_ROLES)[number];
// Mozo: mesas, cobro en efectivo/POS y cerrar mesa; sin WhatsApp, CRM ni configuración (todo eso pide 'agente' o más).
export const ROLE_RANK: Record<PlaceTeamRole, number> = { cocina: 0, mozo: 1, agente: 2, supervisor: 3, admin: 4 };

@Entity('place_team_members')
export class PlaceTeamMember {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ default: 'agente' })
    role: PlaceTeamRole;

    @Column({ name: 'invited_by_user_id', nullable: true })
    invitedByUserId: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
