import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { PlatformAccessService } from '../../modules/platform-access/platform-access.service';
import { hasPermission } from '../../modules/platform-access/permissions';

/**
 * Roles y permisos de la plataforma:
 * - Si la ruta declara @RequirePermission, manda el permiso (perfil del usuario del equipo de Wuarikes).
 * - Si solo dice @Roles('admin'), queda para el Administrador con acceso total: un admin con perfil restringido
 *   no entra por una ruta que no declaró su permiso.
 */
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector, private access: PlatformAccessService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const targets = [context.getHandler(), context.getClass()];
        const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
        const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets);
        const request = context.switchToHttp().getRequest();
        const { user } = request;
        if (!user) return false;

        if (permissions?.length) {
            const owned = await this.access.permissionsOf(user);
            request.platformPermissions = owned;
            return hasPermission(owned, permissions);
        }
        if (!requiredRoles) return true;
        if (!requiredRoles.includes(user.role)) return false;
        if (user.role === 'admin' && requiredRoles.includes('admin')) {
            return (await this.access.permissionsOf(user)).includes('*');
        }
        return true;
    }
}
