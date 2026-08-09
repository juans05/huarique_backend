import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { PlaceTeamMember } from './place-team-member.entity';
import { WhatsAppNumber } from '../../whatsapp/entities/whatsapp-number.entity';

@Entity('team_member_whatsapp_access')
export class TeamMemberWhatsappAccess {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'team_member_id' })
    teamMemberId: string;

    @ManyToOne(() => PlaceTeamMember, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'team_member_id' })
    teamMember: PlaceTeamMember;

    @Column({ name: 'whatsapp_number_id' })
    whatsappNumberId: string;

    @ManyToOne(() => WhatsAppNumber, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'whatsapp_number_id' })
    whatsappNumber: WhatsAppNumber;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
