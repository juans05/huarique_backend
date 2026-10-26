import { getVerticalConfig } from '../places/business-types';

export type BroadcastKind = 'mass' | 'reminder';

/** Mínimo 15 min: el cron revisa cada 5 min. Máximo 7 días. */
export const REMINDER_MIN_OFFSET = 15;
export const REMINDER_MAX_OFFSET = 7 * 1440;

/** La campaña de recordatorio es para los rubros de belleza (barbería, peluquería, spa). */
export function allowsReminderCampaign(businessType: string | null | undefined): boolean {
    return getVerticalConfig(businessType ?? '').vertical === 'belleza';
}

export function validOffset(v: unknown): v is number {
    return Number.isInteger(v) && (v as number) >= REMINDER_MIN_OFFSET && (v as number) <= REMINDER_MAX_OFFSET;
}

export interface ReminderData {
    name: string;
    service: string;
    professional: string;
    date: string;
    time: string;
    place: string;
    link: string;
}

/** Datos de la cita que se pueden usar en las variables de la plantilla. */
export const REMINDER_PLACEHOLDERS: Record<string, keyof ReminderData> = {
    nombre: 'name', servicio: 'service', profesional: 'professional', fecha: 'date', hora: 'time', local: 'place', enlace: 'link',
};

/** Reemplaza {nombre}, {servicio}, {fecha}… en cada variable; Meta no acepta variables vacías. */
export function renderReminderVariables(variables: string[] | null | undefined, data: ReminderData): string[] {
    return (variables ?? []).map((v) =>
        v.replace(/\{(\w+)\}/g, (all, key: string) => {
            const field = REMINDER_PLACEHOLDERS[key.toLowerCase()];
            return field ? data[field] : all;
        }).trim() || '-',
    );
}
