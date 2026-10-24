import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    UseGuards,
    ConflictException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { ArrayMaxSize, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaceRoleGuard } from '../../common/guards/place-role.guard';
import { RequiresPlaceRole } from '../../common/decorators/requires-place-role.decorator';
import { PlaceTeamMember, PlaceTeamRole, PLACE_TEAM_ROLES } from './entities/place-team-member.entity';
import { TeamMemberWhatsappAccess } from './entities/team-member-whatsapp-access.entity';
import { PlaceTeamProfile } from './entities/place-team-profile.entity';
import { PROFILE_BASE_ROLES, TEAM_MODULES } from './team-modules';
import { Place } from '../places/entities/place.entity';
import { UsersService } from '../users/users.service';
import { MailService } from '../../common/services/mail.service';

// Sin esta validación cualquier texto se guardaba como rol y el guard (rango indefinido) lo dejaba pasar.
function assertValidRole(role: string): asserts role is PlaceTeamRole {
    if (!(PLACE_TEAM_ROLES as readonly string[]).includes(role)) throw new BadRequestException('Rol no válido');
}

export class TeamProfileDto {
    @IsString() @MinLength(2) @MaxLength(60) name: string;
    @IsIn(PROFILE_BASE_ROLES) baseRole: PlaceTeamRole;
    @IsArray() @ArrayMaxSize(30) @IsIn(TEAM_MODULES as unknown as string[], { each: true }) modules: string[];
}

@UseGuards(JwtAuthGuard, PlaceRoleGuard)
@Controller('business/places/:placeId/team')
export class TeamController {
    constructor(
        @InjectRepository(PlaceTeamMember)
        private memberRepo: Repository<PlaceTeamMember>,
        @InjectRepository(TeamMemberWhatsappAccess)
        private accessRepo: Repository<TeamMemberWhatsappAccess>,
        @InjectRepository(Place)
        private placesRepo: Repository<Place>,
        @InjectRepository(PlaceTeamProfile)
        private profileRepo: Repository<PlaceTeamProfile>,
        private usersService: UsersService,
        private mailService: MailService,
    ) {}

    // Listar (no gestionar) el equipo requiere Supervisor+ — un Supervisor necesita ver
    // quién más está en el equipo para poder reasignarle conversaciones.
    @Get()
    @RequiresPlaceRole('supervisor')
    async list(@Param('placeId') placeId: string) {
        const members = await this.memberRepo.find({ where: { placeId }, relations: ['user'] });
        const profiles = await this.profileRepo.find({ where: { placeId } });
        const withAccess = await Promise.all(
            members.map(async (m) => {
                const access = m.role === 'agente'
                    ? await this.accessRepo.find({ where: { teamMemberId: m.id } })
                    : [];
                return {
                    id: m.id,
                    userId: m.userId,
                    fullName: m.user.fullName,
                    email: m.user.email,
                    role: m.role,
                    profileId: m.profileId,
                    profileName: profiles.find((p) => p.id === m.profileId)?.name ?? null,
                    whatsappNumberIds: access.map((a) => a.whatsappNumberId),
                    createdAt: m.createdAt,
                };
            }),
        );
        return { data: withAccess };
    }

    // ── Perfiles del negocio ────────────────────────────────────────────
    @Get('profiles')
    @RequiresPlaceRole('supervisor')
    listProfiles(@Param('placeId') placeId: string) {
        return this.profileRepo.find({ where: { placeId }, order: { name: 'ASC' } });
    }

    @Post('profiles')
    @RequiresPlaceRole('admin')
    createProfile(@Param('placeId') placeId: string, @Body() dto: TeamProfileDto) {
        return this.saveProfile(placeId, null, dto);
    }

    @Put('profiles/:profileId')
    @RequiresPlaceRole('admin')
    updateProfile(@Param('placeId') placeId: string, @Param('profileId') profileId: string, @Body() dto: TeamProfileDto) {
        return this.saveProfile(placeId, profileId, dto);
    }

    @Delete('profiles/:profileId')
    @RequiresPlaceRole('admin')
    async deleteProfile(@Param('placeId') placeId: string, @Param('profileId') profileId: string) {
        const profile = await this.profileRepo.findOne({ where: { id: profileId, placeId } });
        if (!profile) throw new NotFoundException('Perfil no encontrado');
        const assigned = await this.memberRepo.count({ where: { placeId, profileId } });
        if (assigned) throw new BadRequestException(`Este perfil lo tienen ${assigned} persona(s). Asígnales otro antes de borrarlo.`);
        await this.profileRepo.delete({ id: profileId });
        return { deleted: true };
    }

    private async saveProfile(placeId: string, profileId: string | null, dto: TeamProfileDto) {
        const current = profileId ? await this.profileRepo.findOne({ where: { id: profileId, placeId } }) : null;
        if (profileId && !current) throw new NotFoundException('Perfil no encontrado');
        const modules = [...new Set(dto.modules)];
        if (!modules.length) throw new BadRequestException('Elige al menos una sección');
        try {
            const saved = await this.profileRepo.save({ ...(current ?? { placeId }), name: dto.name.trim(), baseRole: dto.baseRole, modules });
            // El nivel de quienes ya tienen este perfil sigue al perfil.
            if (current) await this.memberRepo.update({ placeId, profileId: saved.id }, { role: saved.baseRole });
            return saved;
        } catch (err: any) {
            if (err?.code === '23505') throw new BadRequestException('Ya existe un perfil con ese nombre');
            throw err;
        }
    }

    /** Perfil de esta sede; el dueño nunca lleva perfil (perdería acceso a su propio negocio). */
    private async resolveProfile(placeId: string, profileId: string | null | undefined, userId?: string) {
        if (!profileId) return null;
        const profile = await this.profileRepo.findOne({ where: { id: profileId, placeId } });
        if (!profile) throw new BadRequestException('Perfil no encontrado');
        if (userId) {
            const place = await this.placesRepo.findOne({ where: { id: placeId }, select: ['id', 'claimedByUserId'] as any });
            if (place?.claimedByUserId === userId) throw new BadRequestException('El dueño del negocio no lleva perfil');
        }
        return profile;
    }

    @Post()
    @RequiresPlaceRole('admin')
    async create(
        @Param('placeId') placeId: string,
        @Body() dto: { email: string; fullName: string; role?: PlaceTeamRole; profileId?: string | null; whatsappNumberIds?: string[] },
    ) {
        const profile = await this.resolveProfile(placeId, dto.profileId);
        if (profile) dto.role = profile.baseRole;
        assertValidRole(dto.role ?? '');
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');

        const existingUser = await this.usersService.findByEmail(dto.email);

        // Validar ANTES de cualquier efecto secundario (crear cuenta, resetear contraseña) —
        // así un pedido que termina en 409 nunca deja una mutación a medio camino.
        if (existingUser) {
            const existingMembership = await this.memberRepo.findOne({
                where: { userId: existingUser.id, placeId },
            });
            if (existingMembership) {
                throw new ConflictException('Este usuario ya es parte del equipo de esta sede');
            }
        }

        let tempPassword: string | null = null;
        let user = existingUser;

        if (!user) {
            tempPassword = randomBytes(6).toString('hex');
            user = await this.usersService.create(
                dto.email,
                tempPassword,
                dto.fullName,
                true, // isVerified: cuenta creada por un admin, no necesita confirmar email
            );
        }

        // warike_administrativo solo deja entrar a role 'admin' | 'business' (chequeo global,
        // no por-sede) — sin esto, un agente nuevo (role default 'user') no podría loguearse.
        if (user.role === 'user') {
            await this.usersService.updateRole(user.id, 'business');
        }

        if (profile) await this.resolveProfile(placeId, profile.id, user.id);
        const member = await this.memberRepo.save(
            this.memberRepo.create({ userId: user.id, placeId, role: dto.role, profileId: profile?.id ?? null }),
        );

        if (dto.role === 'agente' && dto.whatsappNumberIds?.length) {
            await this.accessRepo.save(
                dto.whatsappNumberIds.map((whatsappNumberId) =>
                    this.accessRepo.create({ teamMemberId: member.id, whatsappNumberId }),
                ),
            );
        }

        let emailSent = true;
        try {
            if (existingUser) {
                // Nunca elegimos ni conocemos la contraseña de una cuenta que ya existía —
                // eso permitiría a un Admin tomar control de la cuenta de cualquier persona
                // con solo saber su email. En su lugar, disparamos el mismo flujo de
                // "olvidé mi contraseña": solo quien tiene acceso a esa casilla puede
                // convertir el código en una contraseña nueva.
                const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
                await this.usersService.setVerificationCode(user.id, resetCode);
                await this.mailService.sendTeamMemberPasswordReset(dto.email, dto.fullName, resetCode, place.name);
            } else {
                await this.mailService.sendTeamMemberCredentials(
                    dto.email,
                    dto.fullName,
                    tempPassword!,
                    place.name,
                    dto.role,
                );
            }
        } catch (error) {
            // El envío de correo es un efecto secundario, no la operación principal: la cuenta
            // y la membresía ya quedaron guardadas arriba. Si falla (ej. dominio de Resend sin
            // verificar), no tiramos abajo la creación.
            emailSent = false;
        }

        return {
            id: member.id,
            userId: user.id,
            role: member.role,
            emailSent,
            isExistingAccount: !!existingUser,
            // Solo para cuentas nuevas: es la única contraseña que el sistema controla y puede
            // mostrarle al Admin como respaldo si el correo no llegó.
            temporaryPassword: existingUser ? null : tempPassword,
        };
    }

    @Put(':memberId')
    @RequiresPlaceRole('admin')
    async update(
        @Param('placeId') placeId: string,
        @Param('memberId') memberId: string,
        @Body() dto: { role?: PlaceTeamRole; profileId?: string | null; whatsappNumberIds?: string[] },
    ) {
        const member = await this.memberRepo.findOne({ where: { id: memberId, placeId } });
        if (!member) throw new NotFoundException('Miembro no encontrado');

        if (dto.profileId !== undefined) {
            // Con perfil, el nivel lo pone el perfil; sin perfil, el rol que se mande (o el actual).
            const profile = await this.resolveProfile(placeId, dto.profileId, member.userId);
            member.profileId = profile?.id ?? null;
            if (profile) member.role = profile.baseRole;
        }
        if (dto.role && !member.profileId) {
            assertValidRole(dto.role);
            member.role = dto.role;
        }
        if (dto.profileId !== undefined || dto.role) await this.memberRepo.save(member);

        if (dto.whatsappNumberIds) {
            await this.accessRepo.delete({ teamMemberId: memberId });
            if (member.role === 'agente' && dto.whatsappNumberIds.length) {
                await this.accessRepo.save(
                    dto.whatsappNumberIds.map((whatsappNumberId) =>
                        this.accessRepo.create({ teamMemberId: memberId, whatsappNumberId }),
                    ),
                );
            }
        }

        return { id: member.id, role: member.role, profileId: member.profileId };
    }

    @Delete(':memberId')
    @RequiresPlaceRole('admin')
    async remove(@Param('placeId') placeId: string, @Param('memberId') memberId: string) {
        const member = await this.memberRepo.findOne({ where: { id: memberId, placeId } });
        if (!member) throw new NotFoundException('Miembro no encontrado');
        await this.memberRepo.delete({ id: memberId });
        return { message: 'Miembro eliminado del equipo' };
    }
}
