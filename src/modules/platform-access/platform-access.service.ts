import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { PlatformProfile } from './platform-profile.entity';
import { PERMISSION_KEYS, PLATFORM_PERMISSIONS, defaultPermissions, hasPermission } from './permissions';

const STAFF_ROLES = ['admin', 'sales'];
const CACHE_MS = 30_000;

/** Permisos efectivos del equipo de Wuarikes y gestión de perfiles. */
@Injectable()
export class PlatformAccessService {
    private cache = new Map<string, { perms: string[]; at: number }>();

    constructor(
        @InjectRepository(PlatformProfile) private profilesRepo: Repository<PlatformProfile>,
        @InjectRepository(User) private usersRepo: Repository<User>,
    ) { }

    /** Permisos del usuario: los de su perfil o, sin perfil, los de su rol (admin = nada, comercial = plantilla). */
    async permissionsOf(user: { id: string; role: string }): Promise<string[]> {
        if (!STAFF_ROLES.includes(user.role)) return [];
        const hit = this.cache.get(user.id);
        if (hit && Date.now() - hit.at < CACHE_MS) return hit.perms;
        const row = await this.usersRepo.findOne({ where: { id: user.id }, select: ['id', 'role', 'platformProfileId', 'isBanned'] as any });
        let perms: string[] = [];
        if (row && !(row as any).isBanned && STAFF_ROLES.includes(row.role)) {
            const profile = (row as any).platformProfileId ? await this.profilesRepo.findOne({ where: { id: (row as any).platformProfileId } }) : null;
            perms = profile ? profile.permissions : defaultPermissions(row.role);
        }
        this.cache.set(user.id, { perms, at: Date.now() });
        return perms;
    }

    async can(user: { id: string; role: string }, ...any: string[]) {
        return hasPermission(await this.permissionsOf(user), any);
    }

    catalog() {
        return PLATFORM_PERMISSIONS;
    }

    // ── Perfiles ────────────────────────────────────────────────────────
    async profiles() {
        const [profiles, counts] = await Promise.all([
            this.profilesRepo.find({ order: { isSystem: 'DESC', name: 'ASC' } }),
            this.usersRepo.createQueryBuilder('u').select('u.platform_profile_id', 'id').addSelect('count(*)::int', 'n').where('u.platform_profile_id IS NOT NULL').groupBy('u.platform_profile_id').getRawMany(),
        ]);
        return profiles.map((p) => ({ ...p, usersCount: counts.find((c) => c.id === p.id)?.n ?? 0 }));
    }

    /** Quien no tiene acceso total solo maneja perfiles que no superan sus permisos, y nunca el suyo. */
    private async assertCanEditProfile(actor: { id: string; perms: string[] }, current: PlatformProfile | null, next: string[]) {
        if (actor.perms.includes('*')) return;
        const within = (keys: string[]) => keys.every((k) => actor.perms.includes(k));
        if (!within(next) || (current && !within(current.permissions))) throw new ForbiddenException('No puedes manejar permisos que tú no tienes');
        if (current) {
            const me = await this.usersRepo.findOne({ where: { id: actor.id }, select: ['id', 'platformProfileId'] as any });
            if ((me as any)?.platformProfileId === current.id) throw new ForbiddenException('No puedes editar tu propio perfil');
        }
    }

    async saveProfile(id: string | null, dto: { name: string; description?: string | null; permissions: string[] }, actor: { id: string; perms: string[] }) {
        const current = id ? await this.profilesRepo.findOne({ where: { id } }) : null;
        if (id && !current) throw new NotFoundException('Perfil no encontrado');
        if (current?.isSystem && current.permissions.includes('*')) throw new BadRequestException('El perfil Administrador no se puede editar');
        const permissions = [...new Set(dto.permissions)].filter((p) => PERMISSION_KEYS.includes(p));
        await this.assertCanEditProfile(actor, current, permissions);
        if (!permissions.length) throw new BadRequestException('Elige al menos un permiso');
        try {
            const saved = await this.profilesRepo.save({ ...(current ?? { isSystem: false }), name: dto.name.trim(), description: dto.description?.trim() || null, permissions });
            this.cache.clear();
            return saved;
        } catch (err: any) {
            if (err?.code === '23505') throw new BadRequestException('Ya existe un perfil con ese nombre');
            throw err;
        }
    }

    async deleteProfile(id: string, actor: { id: string; perms: string[] }) {
        const profile = await this.profilesRepo.findOne({ where: { id } });
        if (!profile) throw new NotFoundException('Perfil no encontrado');
        await this.assertCanEditProfile(actor, profile, []);
        if (profile.isSystem) throw new BadRequestException('Los perfiles de fábrica no se borran');
        // Sin perfil, sus usuarios se quedarían sin acceso: primero hay que reasignarlos.
        const assigned = await this.usersRepo.count({ where: { platformProfileId: id } as any });
        if (assigned) throw new BadRequestException(`Este perfil tiene ${assigned} usuario(s). Asígnales otro perfil antes de borrarlo.`);
        await this.profilesRepo.delete(id);
        return { deleted: true };
    }

    // ── Equipo de la plataforma ─────────────────────────────────────────
    async staff() {
        const users = await this.usersRepo.find({ where: { role: In(STAFF_ROLES) as any }, order: { fullName: 'ASC' } });
        const profiles = await this.profilesRepo.find();
        return users.map((u: any) => ({
            id: u.id, fullName: u.fullName, email: u.email, role: u.role, isBanned: u.isBanned, isVerified: u.isVerified,
            profileId: u.platformProfileId, profileName: profiles.find((p) => p.id === u.platformProfileId)?.name ?? (u.role === 'admin' ? 'Sin perfil (sin acceso)' : 'Comercial (sin perfil)'),
            createdAt: u.createdAt,
        }));
    }

    /** Rol según el perfil: los perfiles con comisiones propias son comerciales (las ventas se les atribuyen). */
    roleForProfile(profile: PlatformProfile): 'admin' | 'sales' {
        return profile.permissions.includes('comisiones.propias') && !profile.permissions.includes('*') ? 'sales' : 'admin';
    }

    async requireProfile(id: string) {
        const profile = await this.profilesRepo.findOne({ where: { id } });
        if (!profile) throw new BadRequestException('Perfil no encontrado');
        return profile;
    }

    async assignProfile(actorId: string, userId: string, profileId: string) {
        if (actorId === userId) throw new ForbiddenException('No puedes cambiar tu propio perfil');
        const user = await this.usersRepo.findOne({ where: { id: userId } });
        if (!user || !STAFF_ROLES.includes(user.role)) throw new NotFoundException('Usuario del equipo no encontrado');
        const profile = await this.requireProfile(profileId);
        await this.usersRepo.update(userId, { platformProfileId: profile.id, role: this.roleForProfile(profile) } as any);
        this.cache.delete(userId);
        return { id: userId, profileId: profile.id, profileName: profile.name };
    }

    /**
     * Quien no tiene acceso total no puede tocar a un Administrador (banear, cambiar perfil, reenviar acceso)
     * ni dar un perfil con permisos que él mismo no tiene.
     */
    async assertCanManage(actorPerms: string[], targetUserId: string, newProfile?: PlatformProfile) {
        if (actorPerms.includes('*')) return;
        // Perfil configurado, no los permisos efectivos: un Administrador baneado sigue siendo Administrador.
        const target = await this.usersRepo.findOne({ where: { id: targetUserId }, select: ['id', 'role', 'platformProfileId'] as any });
        const targetProfile = (target as any)?.platformProfileId ? await this.profilesRepo.findOne({ where: { id: (target as any).platformProfileId } }) : null;
        if (targetProfile?.permissions.includes('*')) throw new ForbiddenException('Solo un Administrador puede gestionar a otro Administrador');
        if (newProfile && !newProfile.permissions.every((p) => actorPerms.includes(p))) throw new ForbiddenException('No puedes dar permisos que tú no tienes');
    }

    invalidate(userId: string) {
        this.cache.delete(userId);
    }
}
