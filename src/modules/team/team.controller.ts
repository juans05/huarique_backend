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
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaceRoleGuard } from '../../common/guards/place-role.guard';
import { RequiresPlaceRole } from '../../common/decorators/requires-place-role.decorator';
import { PlaceTeamMember, PlaceTeamRole } from './entities/place-team-member.entity';
import { TeamMemberWhatsappAccess } from './entities/team-member-whatsapp-access.entity';
import { Place } from '../places/entities/place.entity';
import { UsersService } from '../users/users.service';
import { MailService } from '../../common/services/mail.service';

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
        private usersService: UsersService,
        private mailService: MailService,
    ) {}

    // Listar (no gestionar) el equipo requiere Supervisor+ — un Supervisor necesita ver
    // quién más está en el equipo para poder reasignarle conversaciones.
    @Get()
    @RequiresPlaceRole('supervisor')
    async list(@Param('placeId') placeId: string) {
        const members = await this.memberRepo.find({ where: { placeId }, relations: ['user'] });
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
                    whatsappNumberIds: access.map((a) => a.whatsappNumberId),
                    createdAt: m.createdAt,
                };
            }),
        );
        return { data: withAccess };
    }

    @Post()
    @RequiresPlaceRole('admin')
    async create(
        @Param('placeId') placeId: string,
        @Body() dto: { email: string; fullName: string; role: PlaceTeamRole; whatsappNumberIds?: string[] },
    ) {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');

        const existingUser = await this.usersService.findByEmail(dto.email);
        const tempPassword = randomBytes(6).toString('hex');

        const user = existingUser ?? await this.usersService.create(
            dto.email,
            tempPassword,
            dto.fullName,
            true, // isVerified: cuenta creada por un admin, no necesita confirmar email
        );

        // warike_administrativo solo deja entrar a role 'admin' | 'business' (chequeo global,
        // no por-sede) — sin esto, un agente nuevo (role default 'user') no podría loguearse.
        if (user.role === 'user') {
            await this.usersService.updateRole(user.id, 'business');
        }

        const existingMembership = await this.memberRepo.findOne({ where: { userId: user.id, placeId } });
        if (existingMembership) {
            throw new ConflictException('Este usuario ya es parte del equipo de esta sede');
        }

        const member = await this.memberRepo.save(
            this.memberRepo.create({ userId: user.id, placeId, role: dto.role }),
        );

        if (dto.role === 'agente' && dto.whatsappNumberIds?.length) {
            await this.accessRepo.save(
                dto.whatsappNumberIds.map((whatsappNumberId) =>
                    this.accessRepo.create({ teamMemberId: member.id, whatsappNumberId }),
                ),
            );
        }

        const credentialsMessage = existingUser ? '(usá tu contraseña existente de Wuarike)' : tempPassword;
        let emailSent = true;
        try {
            await this.mailService.sendTeamMemberCredentials(
                dto.email,
                dto.fullName,
                credentialsMessage,
                place.name,
                dto.role,
            );
        } catch (error) {
            // El envío de correo es un efecto secundario, no la operación principal: la cuenta
            // y la membresía ya quedaron guardadas arriba. Si falla (ej. dominio de Resend sin
            // verificar), no tiramos abajo la creación — devolvemos la contraseña temporal para
            // que el Admin se la pase manualmente.
            emailSent = false;
        }

        return {
            id: member.id,
            userId: user.id,
            role: member.role,
            emailSent,
            temporaryPassword: existingUser ? null : tempPassword,
        };
    }

    @Put(':memberId')
    @RequiresPlaceRole('admin')
    async update(
        @Param('placeId') placeId: string,
        @Param('memberId') memberId: string,
        @Body() dto: { role?: PlaceTeamRole; whatsappNumberIds?: string[] },
    ) {
        const member = await this.memberRepo.findOne({ where: { id: memberId, placeId } });
        if (!member) throw new NotFoundException('Miembro no encontrado');

        if (dto.role) {
            member.role = dto.role;
            await this.memberRepo.save(member);
        }

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

        return { id: member.id, role: member.role };
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
