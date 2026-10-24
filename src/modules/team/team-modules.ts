import { PlaceTeamRole } from './entities/place-team-member.entity';

/** Secciones del panel que se pueden dar en un perfil (mismas claves que ModuleKey de business-types.ts). */
export const TEAM_MODULES = [
    'carta', 'agenda', 'pedidos', 'cocina', 'mesas', 'inventario', 'caja', 'social',
    'whatsapp', 'chat', 'plazbot', 'ia', 'broadcasts', 'clientes', 'fidelizacion', 'email-marketing',
    'reputacion', 'reportes',
] as const;

/** Un perfil nunca da nivel admin: así quien tiene perfil no gestiona el equipo ni sus perfiles. */
export const PROFILE_BASE_ROLES: PlaceTeamRole[] = ['cocina', 'mozo', 'agente', 'supervisor'];

// Prefijo de ruta (después de /api/business/) → sección. Lo que no está aquí solo lo controla el nivel.
// ponytail: mapa a mano por prefijo; si se agrega un controlador de negocio nuevo, sumarlo aquí.
const ROUTE_MODULES: [RegExp, string][] = [
    [/^places\/[^/]+\/agenda(\/|$)/, 'agenda'],
    [/^places\/[^/]+\/inventory(\/|$)/, 'inventario'],
    [/^places\/[^/]+\/loyalty(\/|$)/, 'fidelizacion'],
    [/^places\/[^/]+\/social(\/|$)/, 'social'],
    [/^places\/[^/]+\/orders\/kds(\/|$)/, 'cocina'],
    [/^places\/[^/]+\/orders\/cash(\/|$)/, 'caja'],
    [/^places\/[^/]+\/orders\/(tables|tables-board|waiters)(\/|$)/, 'mesas'],
    [/^places\/[^/]+\/orders\/settings(\/|$)/, 'pedidos'],
    [/^places\/[^/]+\/orders\/?$/, 'pedidos'],
    [/^contacts(\/|$)/, 'clientes'],
    [/^conversations(\/|$)/, 'chat'],
    [/^broadcasts(\/|$)/, 'broadcasts'],
    [/^email-campaigns(\/|$)/, 'email-marketing'],
    [/^knowledge-bases(\/|$)/, 'ia'],
    [/^reports(\/|$)/, 'reportes'],
];

/** Sección a la que pertenece una ruta de negocio (path sin query), o null si no está atada a una. */
export function moduleForPath(path: string): string | null {
    const m = /\/api\/business\/(.*)$/.exec(path.split('?')[0]);
    if (!m) return null;
    return ROUTE_MODULES.find(([rx]) => rx.test(m[1]))?.[1] ?? null;
}
