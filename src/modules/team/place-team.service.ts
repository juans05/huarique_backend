import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlaceTeamMember } from './entities/place-team-member.entity';
import { TeamMemberWhatsappAccess } from './entities/team-member-whatsapp-access.entity';
import { Place } from '../places/entities/place.entity';

@Injectable()
export class PlaceTeamService {
    constructor(
        @InjectRepository(PlaceTeamMember)
        private memberRepo: Repository<PlaceTeamMember>,
        @InjectRepository(TeamMemberWhatsappAccess)
        private accessRepo: Repository<TeamMemberWhatsappAccess>,
        @InjectRepository(Place)
        private placeRepo: Repository<Place>,
    ) {}

    /**
     * Resuelve la membresía de un usuario en una sede. Si no hay fila pero el
     * usuario es el dueño histórico (Place.claimedByUserId), se crea la fila
     * admin al vuelo — evita tener que enganchar cada endpoint que reclama un
     * Place (hay varios: onboarding, aprobación de admin, etc).
     */
    async getMembership(userId: string, placeId: string): Promise<PlaceTeamMember | null> {
        const existing = await this.memberRepo.findOne({ where: { userId, placeId } });
        if (existing) return existing;

        const place = await this.placeRepo.findOne({ where: { id: placeId } });
        if (place?.claimedByUserId !== userId) return null;

        const created = this.memberRepo.create({ userId, placeId, role: 'admin' });
        return this.memberRepo.save(created);
    }

    /** 'all' para admin/supervisor; lista de whatsappNumberId explícita para agente. */
    async getAccessibleWhatsappNumberIds(member: PlaceTeamMember): Promise<string[] | 'all'> {
        if (member.role === 'admin' || member.role === 'supervisor') return 'all';

        const rows = await this.accessRepo.find({ where: { teamMemberId: member.id } });
        return rows.map((r) => r.whatsappNumberId);
    }
}
