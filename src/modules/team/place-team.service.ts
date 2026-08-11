import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlaceTeamMember } from './entities/place-team-member.entity';
import { TeamMemberWhatsappAccess } from './entities/team-member-whatsapp-access.entity';
import { Place } from '../places/entities/place.entity';
import { SubscriptionsService, SubscriptionTier } from '../subscriptions/subscriptions.service';

@Injectable()
export class PlaceTeamService {
    constructor(
        @InjectRepository(PlaceTeamMember)
        private memberRepo: Repository<PlaceTeamMember>,
        @InjectRepository(TeamMemberWhatsappAccess)
        private accessRepo: Repository<TeamMemberWhatsappAccess>,
        @InjectRepository(Place)
        private placeRepo: Repository<Place>,
        private subscriptionsService: SubscriptionsService,
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

    /**
     * Valida que la SEDE (no el usuario que llama) tenga el plan pedido activo —
     * resuelto vía el dueño que lo pagó. Único lugar con esta lógica: cualquier
     * otro punto que necesite el mismo chequeo (ej. conversations.controller.ts,
     * que ya resuelve la membresía por su cuenta y solo necesita la parte de
     * tier) debe llamar a este método en vez de reimplementarlo.
     */
    async assertPlaceTier(placeId: string, requiredTier: SubscriptionTier): Promise<void> {
        const subscription = await this.subscriptionsService.getSubscriptionForPlace(placeId);
        const hasAccess = subscription?.status === 'active'
            && this.subscriptionsService.hasTierAccess(subscription.tier, requiredTier);
        if (!hasAccess) {
            throw new ForbiddenException('Esta sede necesita una suscripción activa para usar esta función.');
        }
    }

    /**
     * Punto único de autorización para rutas de negocio por sede: valida que el
     * usuario sea parte del equipo (con el mismo fallback de dueño histórico de
     * getMembership) y, si se pide un `requiredTier`, delega en assertPlaceTier.
     * Así un Agente/Supervisor hereda el plan de la sede en la que trabaja en
     * vez de necesitar su propia suscripción.
     */
    async assertAccess(
        userId: string,
        placeId: string,
        requiredTier?: SubscriptionTier,
    ): Promise<PlaceTeamMember> {
        const member = await this.getMembership(userId, placeId);
        if (!member) {
            throw new ForbiddenException('No tenés acceso a esta sede');
        }

        if (requiredTier) {
            await this.assertPlaceTier(placeId, requiredTier);
        }

        return member;
    }
}
