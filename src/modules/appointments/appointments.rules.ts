import type { DayHours } from './entities/professional.entity';

// Perú no cambia de horario: Lima es siempre UTC-5.
const LIMA = '-05:00';
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DEFAULT_HOURS = { open: '09:00', close: '20:00' };
export const DEFAULT_DURATION_MIN = 30;

export type Range = { start: Date; end: Date };

/** 'YYYY-MM-DD' + 'HH:MM' en hora de Lima → instante. */
export const limaInstant = (date: string, time: string) => new Date(`${date}T${time}:00${LIMA}`);
/** Fecha de Lima (YYYY-MM-DD) de un instante. */
export const limaDate = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
/** Hora de Lima (HH:MM) de un instante. */
export const limaTime = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(11, 16);
export const dayKey = (date: string) => DAY_KEYS[new Date(`${date}T12:00:00${LIMA}`).getUTCDay()];
/** "sábado 25" */
export const dayLabel = (date: string) => `${DAY_NAMES[new Date(`${date}T12:00:00${LIMA}`).getUTCDay()]} ${Number(date.slice(8, 10))}`;
/** "4:00 pm" */
export const timeLabel = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
export const addDays = (date: string, days: number) => limaDate(new Date(limaInstant(date, '12:00').getTime() + days * 86400_000));

/**
 * Horario de trabajo de un profesional ese día: su horario propio, o el del local, o 09:00–20:00.
 * null si es su día libre o no trabaja ese día de la semana.
 */
export function workingWindow(pro: { schedule: DayHours[] | null; daysOff: string[] }, placeHours: DayHours[] | null, date: string): Range | null {
    if (pro.daysOff?.includes(date)) return null;
    const hours = pro.schedule?.length ? pro.schedule : placeHours?.length ? placeHours : null;
    const today = hours ? hours.find((h) => h.day === dayKey(date)) : DEFAULT_HOURS;
    if (!today || today.close <= today.open) return null;
    return { start: limaInstant(date, today.open), end: limaInstant(date, today.close) };
}

export const overlaps = (a: Range, b: Range) => a.start < b.end && b.start < a.end;

/** Inicios posibles (cada `stepMin`) donde el servicio completo entra en el horario sin cruzarse con otra cita. */
export function freeSlots(window: Range | null, busy: Range[], durationMin: number, now: Date, stepMin = 15): Date[] {
    if (!window) return [];
    const slots: Date[] = [];
    const dur = durationMin * 60_000;
    for (let t = window.start.getTime(); t + dur <= window.end.getTime(); t += stepMin * 60_000) {
        const slot = { start: new Date(t), end: new Date(t + dur) };
        if (slot.start > now && !busy.some((b) => overlaps(slot, b))) slots.push(slot.start);
    }
    return slots;
}

/** Respuesta JSON de la IA: {"reply": "...", "actions": [...]}; null si no se puede leer. */
export function parseAgentJson<T>(raw: string): { reply: string; actions: T[] } | null {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[0]);
        if (typeof parsed.reply !== 'string') return null;
        return { reply: parsed.reply, actions: Array.isArray(parsed.actions) ? parsed.actions : [] };
    } catch {
        return null;
    }
}

/** Palabras que abren una conversación de reserva (sin borrador previo). */
export const looksLikeBookingIntent = (text: string) =>
    /\b(cita|citas|reserv|agend|turno|hora disponible|horario|disponib|cupo|corte|atender|atiende|separar)/i.test(text);
