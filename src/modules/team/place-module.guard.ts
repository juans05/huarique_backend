import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { verify } from 'jsonwebtoken';
import { moduleForPath } from './team-modules';

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
        const req = context.switchToHttp().getRequest();
        const module = moduleForPath(req.originalUrl ?? req.url ?? '');
        if (!module) return true;

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

        const placeId = req.params?.placeId ?? req.query?.placeId ?? req.body?.placeId;
        const allowed = placeId ? await this.allowedInPlace(userId, placeId, module) : await this.allowedSomewhere(userId, module);
        if (!allowed) throw new ForbiddenException('Tu perfil no incluye esta sección');
        return true;
    }

    private async allowedInPlace(userId: string, placeId: string, module: string) {
        const [row] = await this.dataSource.query(
            `SELECT p.modules FROM wuarike_db.place_team_members m JOIN wuarike_db.place_team_profiles p ON p.id = m.profile_id
             WHERE m.user_id = $1 AND m.place_id = $2`,
            [userId, placeId],
        );
        return !row || row.modules.includes(module);
    }

    /** Rutas por id (una conversación, una campaña): basta con tener la sección en alguna sede, o no tener perfil en ninguna. */
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
