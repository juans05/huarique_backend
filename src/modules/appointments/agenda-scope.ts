import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PlaceTeamMember, PlaceTeamRole } from '../team/entities/place-team-member.entity';
import { Professional } from './entities/professional.entity';

export type AgendaScope = { scope: 'all' | 'own'; professionalId: string | null };

const MANAGERS: PlaceTeamRole[] = ['admin', 'supervisor'];

/**
 * El barbero de una barbería (miembro ligado a un profesional, sin rol de encargado) ve y toca solo sus citas.
 * El dueño (llega como admin), los encargados y quien no atiende (recepción) ven toda la agenda.
 */
export function scopeFor(role: PlaceTeamRole, linkedProId: string | null): AgendaScope {
    return !MANAGERS.includes(role) && linkedProId ? { scope: 'own', professionalId: linkedProId } : { scope: 'all', professionalId: null };
}

/** La app es para quien atiende o encarga; recepción usa el panel web. */
export const canUseApp = (role: PlaceTeamRole, s: AgendaScope) => s.scope === 'own' || MANAGERS.includes(role);

export function assertOwnAppt(scopeProId: string | null, appt: { professionalId: string }) {
    if (scopeProId && appt.professionalId !== scopeProId) throw new ForbiddenException('Esa cita no es tuya');
}

export async function resolveAgendaScope(member: PlaceTeamMember, prosRepo: Repository<Professional>): Promise<AgendaScope> {
    if (MANAGERS.includes(member.role)) return scopeFor(member.role, null);
    const pro = await prosRepo.findOne({ where: { placeId: member.placeId, teamUserId: member.userId }, select: ['id'] });
    return scopeFor(member.role, pro?.id ?? null);
}
