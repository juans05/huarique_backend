import { BadRequestException } from '@nestjs/common';
import type { PlaceTeamRole } from '../team/entities/place-team-member.entity';

/**
 * Fuente única de rubros (vertical) y tipos de negocio. El panel y la web no tienen copia:
 * la reciben por `GET /api/places/business-types` y por `my-places`.
 * Agregar un subtipo es agregar una línea en BUSINESS_TYPES.
 */

export type Vertical =
    | 'gastronomia'
    | 'comercio'
    | 'belleza'
    | 'salud'
    | 'mascotas'
    | 'automotriz'
    | 'servicios'
    | 'entretenimiento';

export type ModuleKey =
    | 'reputacion'
    | 'social'
    | 'carta'
    | 'pedidos'
    | 'cocina'
    | 'mesas'
    | 'fidelizacion'
    | 'clientes'
    | 'email-marketing'
    | 'whatsapp'
    | 'plazbot'
    | 'chat'
    | 'reportes'
    | 'equipo'
    | 'broadcasts'
    | 'ia'
    | 'agenda';

export interface VerticalConfig {
    label: string;
    modules: ModuleKey[];
    labels: { catalog: string; catalogItem: string; customer: string };
    catalogKind: 'producto' | 'servicio' | 'mixto';
    teamRoles: PlaceTeamRole[];
    botPersona: string;
}

const ALL_MODULES: ModuleKey[] = [
    'reputacion', 'social', 'carta', 'pedidos', 'cocina', 'mesas', 'fidelizacion', 'clientes',
    'email-marketing', 'whatsapp', 'plazbot', 'chat', 'reportes', 'equipo', 'broadcasts', 'ia',
];
// Pedidos, cocina y mesas son de gastronomía; la agenda de citas, de los rubros que atienden con cita.
// Solo gastronomía opera pedidos, cocina y mesas.
const CORE_MODULES = ALL_MODULES.filter((m) => m !== 'pedidos' && m !== 'cocina' && m !== 'mesas');
const BOOKING_MODULES: ModuleKey[] = [...CORE_MODULES, 'agenda'];
const TEAM_ROLES: PlaceTeamRole[] = ['admin', 'supervisor', 'agente'];

export const BUSINESS_TYPES: Record<string, { label: string; vertical: Vertical }> = {
    restaurante: { label: 'Restaurante', vertical: 'gastronomia' },
    comida_rapida: { label: 'Comida rápida', vertical: 'gastronomia' },
    cafeteria: { label: 'Cafetería', vertical: 'gastronomia' },
    heladeria: { label: 'Heladería', vertical: 'gastronomia' },
    bodega: { label: 'Bodega', vertical: 'comercio' },
    minimarket: { label: 'Minimarket', vertical: 'comercio' },
    boutique: { label: 'Boutique', vertical: 'comercio' },
    ferreteria: { label: 'Ferretería', vertical: 'comercio' },
    jugueteria: { label: 'Juguetería', vertical: 'comercio' },
    ecommerce: { label: 'Tienda online', vertical: 'comercio' },
    barberia: { label: 'Barbería', vertical: 'belleza' },
    peluqueria: { label: 'Peluquería', vertical: 'belleza' },
    spa: { label: 'Spa', vertical: 'belleza' },
    consultorio: { label: 'Consultorio', vertical: 'salud' },
    odontologia: { label: 'Odontología', vertical: 'salud' },
    fisioterapia: { label: 'Fisioterapia', vertical: 'salud' },
    petshop: { label: 'Pet shop', vertical: 'mascotas' },
    veterinaria: { label: 'Veterinaria', vertical: 'mascotas' },
    grooming: { label: 'Grooming', vertical: 'mascotas' },
    taller: { label: 'Taller mecánico', vertical: 'automotriz' },
    lavadero: { label: 'Lavadero', vertical: 'automotriz' },
    detailing: { label: 'Detailing', vertical: 'automotriz' },
    lubricentro: { label: 'Lubricentro', vertical: 'automotriz' },
    servicio_tecnico: { label: 'Servicio técnico', vertical: 'servicios' },
    canchas: { label: 'Canchas deportivas', vertical: 'entretenimiento' },
    centro_recreativo: { label: 'Centro recreativo', vertical: 'entretenimiento' },
    sala_juegos: { label: 'Sala de juegos', vertical: 'entretenimiento' },
    eventos: { label: 'Eventos', vertical: 'entretenimiento' },
};

export const VERTICALS: Record<Vertical, VerticalConfig> = {
    gastronomia: {
        label: 'Gastronomía',
        modules: ALL_MODULES,
        labels: { catalog: 'Carta', catalogItem: 'Plato', customer: 'Cliente' },
        catalogKind: 'producto',
        teamRoles: ['admin', 'supervisor', 'agente', 'cocina'],
        botPersona: 'asistente virtual de un restaurante',
    },
    comercio: {
        label: 'Comercio',
        modules: CORE_MODULES,
        labels: { catalog: 'Productos', catalogItem: 'Producto', customer: 'Cliente' },
        catalogKind: 'producto',
        teamRoles: TEAM_ROLES,
        botPersona: 'asistente de ventas de una tienda',
    },
    belleza: {
        label: 'Belleza',
        modules: BOOKING_MODULES,
        labels: { catalog: 'Servicios', catalogItem: 'Servicio', customer: 'Cliente' },
        catalogKind: 'servicio',
        teamRoles: TEAM_ROLES,
        botPersona: 'recepcionista de un local de belleza',
    },
    salud: {
        label: 'Salud',
        modules: BOOKING_MODULES,
        labels: { catalog: 'Servicios', catalogItem: 'Servicio', customer: 'Paciente' },
        catalogKind: 'servicio',
        teamRoles: TEAM_ROLES,
        botPersona: 'recepcionista de un centro de salud',
    },
    mascotas: {
        label: 'Mascotas',
        modules: BOOKING_MODULES,
        labels: { catalog: 'Catálogo', catalogItem: 'Producto o servicio', customer: 'Tutor' },
        catalogKind: 'mixto',
        teamRoles: TEAM_ROLES,
        botPersona: 'asistente de un negocio para mascotas',
    },
    automotriz: {
        label: 'Automotriz',
        modules: BOOKING_MODULES,
        labels: { catalog: 'Servicios', catalogItem: 'Servicio', customer: 'Cliente' },
        catalogKind: 'servicio',
        teamRoles: TEAM_ROLES,
        botPersona: 'asesor de servicio de un taller automotriz',
    },
    servicios: {
        label: 'Servicios',
        modules: BOOKING_MODULES,
        labels: { catalog: 'Servicios', catalogItem: 'Servicio', customer: 'Cliente' },
        catalogKind: 'servicio',
        teamRoles: TEAM_ROLES,
        botPersona: 'asistente de atención al cliente de un negocio de servicios',
    },
    entretenimiento: {
        label: 'Entretenimiento',
        modules: CORE_MODULES,
        labels: { catalog: 'Servicios', catalogItem: 'Servicio', customer: 'Cliente' },
        catalogKind: 'servicio',
        teamRoles: TEAM_ROLES,
        botPersona: 'asistente de reservas de un centro de entretenimiento',
    },
};

export function isBusinessType(v: unknown): v is string {
    return typeof v === 'string' && Object.prototype.hasOwnProperty.call(BUSINESS_TYPES, v);
}

/** Un tipo desconocido cae en gastronomía (todo local existente es restaurante). */
export function verticalOf(businessType: string): Vertical {
    return isBusinessType(businessType) ? BUSINESS_TYPES[businessType].vertical : 'gastronomia';
}

export function getVerticalConfig(businessType: string): VerticalConfig & { vertical: Vertical } {
    const vertical = verticalOf(businessType);
    return { vertical, ...VERTICALS[vertical] };
}

/** Tipo que se asume cuando un cliente anterior al multirrubro no envía `businessType`. */
export const DEFAULT_BUSINESS_TYPE = 'restaurante';

/** Valida un tipo de negocio recibido del cliente: 400 si no existe en BUSINESS_TYPES. */
export function requireBusinessType(v: unknown): string {
    if (!isBusinessType(v)) throw new BadRequestException('Tipo de negocio no válido');
    return v;
}

/** Una categoría sin rubro (o ninguna) no restringe; con rubro debe ser el del tipo de negocio. */
export function categoryMatchesVertical(category: { vertical?: string | null } | null | undefined, businessType: string): boolean {
    return !category?.vertical || category.vertical === verticalOf(businessType);
}

export function assertCategoryMatchesVertical(category: { vertical?: string | null } | null | undefined, businessType: string): void {
    if (!categoryMatchesVertical(category, businessType)) {
        throw new BadRequestException('La categoría no corresponde al rubro del negocio');
    }
}

export function typesOfVertical(v: Vertical): string[] {
    return Object.keys(BUSINESS_TYPES).filter((k) => BUSINESS_TYPES[k].vertical === v);
}

/** Respuesta pública: no expone `modules` ni `botPersona`. */
export function publicBusinessTypes() {
    return {
        verticals: (Object.keys(VERTICALS) as Vertical[]).map((key) => ({
            key,
            label: VERTICALS[key].label,
            catalogLabel: VERTICALS[key].labels.catalog,
            types: typesOfVertical(key).map((t) => ({ key: t, label: BUSINESS_TYPES[t].label })),
        })),
    };
}
