import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { verify } from 'jsonwebtoken';
import { moduleForPath } from './team-modules';

// Rutas por id sin sede en la URL: de qué tabla sale la sede del recurso.
const ID_PLACE_LOOKUP: Record<string, string> = {
    conversationId: 'conversations',
    broadcastId: 'broadcasts',
    campaignId: 'email_campaigns',
    kbId: 'knowledge_bases',
};

/**
 * Guard global: si la ruta de negocio pertenece a una sección y el miembro del equipo tiene un perfil
 * que no la incluye, 403. Sin perfil (o dueño) no cambia nada. El token se lee aquí porque los guards
 * globales corren antes que JwtAuthGuard; si no hay token válido, decide JwtAuthGuard.
 */
@Injectable()
export class PlaceModuleGuard implements CanActivate {
    constructor(private dataSource: DataSource, private config: ConfigService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http') return true;
        // Plantilla de la ruta que Nest ya resolvió (no la URL): sin trucos de mayúsculas, dobles barras ni encoding.
        const template = [Reflect.getMetadata(PATH_METADATA, context.getClass()), Reflect.getMetadata(PATH_METADATA, context.getHandler())]
            .filter((s) => typeof s === 'string').join('/');
        const module = moduleForPath(`/api/${template}`.replace(/\/+/g, '/'));
        if (!module) return true;

        const req = context.switchToHttp().getRequest();
        const header: string = req.headers?.authorization ?? '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.accessToken;
        if (!token) return true;
        let userId: string;
        try {
            userId = (verify(token, this.config.get<string>('JWT_SECRET')!) as any).sub;
        } catch {
            return true;
        }
        if (!userId) return true;

        const placeId = req.params?.placeId ?? req.query?.placeId ?? req.body?.placeId ?? (await this.placeOfResource(req.params ?? {}));
        const allowed = placeId ? await this.allowedInPlace(userId, placeId, module) : await this.allowedSomewhere(userId, module);
        if (!allowed) throw new ForbiddenException('Tu perfil no incluye esta sección');
        return true;
    }

    private async placeOfResource(params: Record<string, string>): Promise<string | null> {
        const key = Object.keys(ID_PLACE_LOOKUP).find((k) => params[k]);
        if (!key || !/^[0-9a-f-]{36}$/i.test(params[key])) return null;
        const [row] = await this.dataSource.query(`SELECT place_id FROM wuarike_db.${ID_PLACE_LOOKUP[key]} WHERE id = $1`, [params[key]]);
        return row?.place_id ?? null;
    }

    private async allowedInPlace(userId: string, placeId: string, module: string) {
        const [row] = await this.dataSource.query(
            `SELECT p.modules FROM wuarike_db.place_team_members m JOIN wuarike_db.place_team_profiles p ON p.id = m.profile_id
             WHERE m.user_id = $1 AND m.place_id = $2`,
            [userId, placeId],
        );
        return !row || row.modules.includes(module);
    }

    /** Sin sede conocida (recurso inexistente o ruta sin sede): se niega a quien solo tiene perfiles sin la sección. */
    private async allowedSomewhere(userId: string, module: string) {
        const [row] = await this.dataSource.query(
            `SELECT
               EXISTS (SELECT 1 FROM wuarike_db.place_team_members m WHERE m.user_id = $1 AND m.profile_id IS NOT NULL) AS restricted,
               EXISTS (SELECT 1 FROM wuarike_db.place_team_members m LEFT JOIN wuarike_db.place_team_profiles p ON p.id = m.profile_id
                       WHERE m.user_id = $1 AND (m.profile_id IS NULL OR $2 = ANY(p.modules))) AS granted,
               EXISTS (SELECT 1 FROM wuarike_db.places WHERE claimed_by_user_id = $1) AS owner`,
            [userId, module],
        );
        return !row.restricted || row.granted || row.owner;
    }
}
