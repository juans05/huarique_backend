/**
 * Permisos del equipo de Wuarikes (plataforma). Un perfil es una lista de estas claves; '*' = todo.
 * Las variantes "propias" limitan los datos al comercial que pide (sus locales, sus comisiones).
 */
export const PLATFORM_PERMISSIONS = [
    { key: 'locales.ver', group: 'Locales', label: 'Ver locales, solicitudes y reclamos de dueños' },
    { key: 'locales.gestionar', group: 'Locales', label: 'Aprobar, editar e importar locales' },
    { key: 'oportunidades.propias', group: 'Comercial', label: 'Sus oportunidades y locales asignados' },
    { key: 'oportunidades.todas', group: 'Comercial', label: 'Todas las oportunidades y asignar comerciales' },
    { key: 'comisiones.propias', group: 'Comercial', label: 'Ver sus comisiones' },
    { key: 'suscripciones.link', group: 'Comercial', label: 'Enviar el link de suscripción a sus clientes' },
    { key: 'suscripciones.ver', group: 'Finanzas', label: 'Ver suscripciones e ingresos' },
    { key: 'comisiones.todas', group: 'Finanzas', label: 'Gestionar comisiones de todos los comerciales' },
    { key: 'liquidaciones.gestionar', group: 'Finanzas', label: 'Liquidaciones de pedidos a locales' },
    { key: 'reclamaciones.gestionar', group: 'Operación', label: 'Libro de reclamaciones' },
    { key: 'qr.gestionar', group: 'Operación', label: 'Códigos QR y pedidos de dispositivos' },
    { key: 'whatsapp.gestionar', group: 'Operación', label: 'Números y bot de WhatsApp de los locales' },
    { key: 'usuarios.ver', group: 'Administración', label: 'Ver usuarios' },
    { key: 'usuarios.gestionar', group: 'Administración', label: 'Crear, bloquear y reenviar acceso a usuarios' },
    { key: 'perfiles.gestionar', group: 'Administración', label: 'Crear y editar perfiles y permisos' },
    { key: 'plataforma.config', group: 'Administración', label: 'Configuración de la plataforma y créditos' },
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number]['key'] | '*';
export const PERMISSION_KEYS = PLATFORM_PERMISSIONS.map((p) => p.key) as string[];

/** Perfiles que vienen listos (se pueden editar; "Administrador" no). */
export const SYSTEM_PROFILES: { name: string; description: string; permissions: PlatformPermission[] }[] = [
    { name: 'Administrador', description: 'Acceso total a la plataforma', permissions: ['*'] },
    { name: 'Comercial', description: 'Sus locales, oportunidades y comisiones', permissions: ['locales.ver', 'oportunidades.propias', 'comisiones.propias', 'suscripciones.link'] },
    { name: 'Moderador', description: 'Control de locales, reclamaciones y QR', permissions: ['locales.ver', 'locales.gestionar', 'reclamaciones.gestionar', 'qr.gestionar'] },
    { name: 'Finanzas', description: 'Suscripciones, liquidaciones y comisiones', permissions: ['locales.ver', 'suscripciones.ver', 'comisiones.todas', 'liquidaciones.gestionar'] },
    { name: 'Soporte', description: 'Usuarios y bot de WhatsApp', permissions: ['locales.ver', 'usuarios.ver', 'usuarios.gestionar', 'whatsapp.gestionar'] },
];

/** Sin perfil asignado: el admin conserva todo (como antes) y el comercial usa la plantilla Comercial. */
export function defaultPermissions(role: string): PlatformPermission[] {
    if (role === 'sales') return SYSTEM_PROFILES.find((p) => p.name === 'Comercial')!.permissions;
    return [];
}

export const hasPermission = (owned: string[], any: string[]) => owned.includes('*') || any.some((p) => owned.includes(p));
