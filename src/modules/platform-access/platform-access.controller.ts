import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAccessService } from './platform-access.service';
import { AdminService } from '../admin/admin.service';

export class ProfileDto {
    @IsString() @MinLength(2) @MaxLength(60) name: string;
    @IsOptional() @IsString() @MaxLength(200) description?: string | null;
    @IsArray() @IsString({ each: true }) @ArrayMaxSize(50) permissions: string[];
}

export class StaffDto {
    @IsString() @MinLength(2) @MaxLength(120) fullName: string;
    @IsEmail() email: string;
    @IsUUID() profileId: string;
}

export class AssignProfileDto {
    @IsUUID() profileId: string;
}

/** Perfiles, permisos y usuarios del equipo de Wuarikes. */
@Controller('admin/access')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlatformAccessController {
    constructor(private access: PlatformAccessService, private admin: AdminService) { }

    /** Permisos del usuario actual (el panel arma el menú con esto). Cualquier usuario autenticado. */
    @Get('me')
    async me(@CurrentUser() user: any) {
        return { role: user.role, permissions: await this.access.permissionsOf(user) };
    }

    @Get('catalog')
    @RequirePermission('perfiles.gestionar', 'usuarios.gestionar')
    catalog() {
        return this.access.catalog();
    }

    @Get('profiles')
    @RequirePermission('perfiles.gestionar', 'usuarios.ver', 'usuarios.gestionar')
    profiles() {
        return this.access.profiles();
    }

    @Post('profiles')
    @RequirePermission('perfiles.gestionar')
    createProfile(@Body() dto: ProfileDto) {
        return this.access.saveProfile(null, dto);
    }

    @Put('profiles/:id')
    @RequirePermission('perfiles.gestionar')
    updateProfile(@Param('id') id: string, @Body() dto: ProfileDto) {
        return this.access.saveProfile(id, dto);
    }

    @Delete('profiles/:id')
    @RequirePermission('perfiles.gestionar')
    deleteProfile(@Param('id') id: string) {
        return this.access.deleteProfile(id);
    }

    @Get('staff')
    @RequirePermission('usuarios.ver', 'usuarios.gestionar')
    staff() {
        return this.access.staff();
    }

    /** Crea un usuario del equipo con su perfil; recibe un correo para activar su cuenta y poner su contraseña. */
    @Post('staff')
    @RequirePermission('usuarios.gestionar')
    async createStaff(@Body() dto: StaffDto, @CurrentUser() actor: any, @Req() req: any) {
        const profile = await this.access.requireProfile(dto.profileId);
        // Solo quien tiene acceso total puede crear otro Administrador completo.
        if (profile.permissions.includes('*') && !(req.platformPermissions ?? []).includes('*')) {
            throw new ForbiddenException('Solo un Administrador puede crear otro Administrador');
        }
        // Contraseña aleatoria que nadie conoce: el usuario pone la suya al activar la cuenta desde el correo.
        const tempPassword = randomBytes(18).toString('base64url');
        const created = await this.admin.createUser({ email: dto.email.trim().toLowerCase(), fullName: dto.fullName.trim(), password: tempPassword, role: this.access.roleForProfile(profile) });
        const id = (created as any).id as string;
        await this.access.assignProfile(actor.id, id, profile.id);
        return { id, email: dto.email, profileName: profile.name, message: 'Usuario creado. Le enviamos un correo para activar su cuenta.' };
    }

    @Patch('staff/:id/profile')
    @RequirePermission('usuarios.gestionar')
    async assignProfile(@Param('id') id: string, @Body() dto: AssignProfileDto, @CurrentUser() actor: any, @Req() req: any) {
        const profile = await this.access.requireProfile(dto.profileId);
        if (profile.permissions.includes('*') && !(req.platformPermissions ?? []).includes('*')) {
            throw new ForbiddenException('Solo un Administrador puede dar acceso total');
        }
        return this.access.assignProfile(actor.id, id, dto.profileId);
    }

}
