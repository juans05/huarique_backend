import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

function ctx(user: any, meta: Record<string, any>) {
    const reflector = { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
    const request: any = { user };
    const context: any = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => request }) };
    return { reflector, context, request };
}

describe('RolesGuard con permisos de plataforma', () => {
    const access = (perms: Record<string, string[]>) => ({ permissionsOf: jest.fn(async (u: any) => perms[u.id] ?? []) });
    const perms = { admin: ['*'], comercial: ['locales.ver', 'oportunidades.propias'], moderador: ['locales.ver', 'locales.gestionar'] };

    it('ruta con permiso: entra quien lo tiene (o tiene *), no el resto', async () => {
        const meta = { [PERMISSIONS_KEY]: ['locales.gestionar'], [ROLES_KEY]: ['admin'] };
        for (const [id, role, expected] of [['admin', 'admin', true], ['moderador', 'admin', true], ['comercial', 'sales', false]] as const) {
            const { reflector, context } = ctx({ id, role }, meta);
            expect(await new RolesGuard(reflector, access(perms) as any).canActivate(context)).toBe(expected);
        }
    });

    it('el comercial entra a las rutas de sus permisos aunque la clase diga @Roles(admin)', async () => {
        const { reflector, context, request } = ctx({ id: 'comercial', role: 'sales' }, { [PERMISSIONS_KEY]: ['oportunidades.todas', 'oportunidades.propias'], [ROLES_KEY]: ['admin'] });
        expect(await new RolesGuard(reflector, access(perms) as any).canActivate(context)).toBe(true);
        expect(request.platformPermissions).toEqual(perms.comercial);
    });

    it('ruta solo @Roles(admin) sin permiso declarado: solo el Administrador con acceso total', async () => {
        const meta = { [ROLES_KEY]: ['admin'] };
        const g = (id: string, role: string) => { const { reflector, context } = ctx({ id, role }, meta); return new RolesGuard(reflector, access(perms) as any).canActivate(context); };
        expect(await g('admin', 'admin')).toBe(true);
        expect(await g('moderador', 'admin')).toBe(false);
        expect(await g('comercial', 'sales')).toBe(false);
    });

    it('rutas de negocio (@Roles business) siguen igual', async () => {
        const { reflector, context } = ctx({ id: 'x', role: 'business' }, { [ROLES_KEY]: ['business', 'admin'] });
        expect(await new RolesGuard(reflector, access(perms) as any).canActivate(context)).toBe(true);
    });
});
