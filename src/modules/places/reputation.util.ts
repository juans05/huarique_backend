import { AutoReplySettings, ReplyTone, ReviewAutoSettings } from './review-reply.util';

export const PUBLISH_PER_RUN = 8; // Google: 10 ediciones/min por perfil, no ampliable.
export const AI_LIMIT_BASIC = 10;
export const AI_LIMIT_FAIR_USE = 1000;
export const AI_QUOTA_MESSAGE = 'Usaste tus 10 respuestas con IA de este mes. Mejora a Fidelización+ para respuestas ilimitadas.';

const LIMA_OFFSET_MS = 5 * 3_600_000; // Lima = UTC−5, sin horario de verano.

/** Lunes 00:00 de Lima de la semana de `now`, como instante UTC. */
export function limaWeekStart(now = new Date()): Date {
    const lima = new Date(now.getTime() - LIMA_OFFSET_MS);
    const daysSinceMonday = (lima.getUTCDay() + 6) % 7;
    return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate() - daysSinceMonday) + LIMA_OFFSET_MS);
}

/** Día 1 00:00 de Lima del mes de `now`, como instante UTC. */
export function limaMonthStart(now = new Date()): Date {
    const lima = new Date(now.getTime() - LIMA_OFFSET_MS);
    return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), 1) + LIMA_OFFSET_MS);
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Palabras clave presentes en el texto, sin distinguir mayúsculas ni tildes, por palabra o frase completa. */
export function matchKeywords(text: string | null | undefined, keywords: string[] = []): string[] {
    if (!text) return [];
    const haystack = ` ${fold(text)} `;
    return keywords.filter((k) => {
        const needle = fold(k);
        return needle.length > 0 && haystack.includes(` ${needle} `);
    });
}

export function shouldAlert(stars: number, comment: string | null | undefined, settings: ReviewAutoSettings): { alert: boolean; matched: string[] } {
    if (settings.alerts === false) return { alert: false, matched: [] };
    const matched = matchKeywords(comment, settings.keywords);
    const low = stars >= 1 && stars <= (settings.lowRatingMax ?? 3);
    return { alert: low || matched.length > 0, matched };
}

export function randomDelayMs(minMinutes: number, maxMinutes: number, rnd: () => number = Math.random): number {
    return Math.round((minMinutes + rnd() * (maxMinutes - minMinutes)) * 60_000);
}

/** `activeTier` = tier de la suscripción activa de la sede, o null. */
export function aiReplyLimit(activeTier: string | null): number {
    return activeTier === 'fidelizacion' || activeTier === 'ia_total' ? AI_LIMIT_FAIR_USE : AI_LIMIT_BASIC;
}

const TEMPLATES: ((name: string) => string)[] = [
    (n) => `¡Muchas gracias${n} por tu reseña! Nos alegra que lo hayas disfrutado. Te esperamos pronto.`,
    (n) => `¡Gracias${n}! Comentarios así le dan ánimo a todo el equipo. ¡Vuelve cuando quieras!`,
    (n) => `Qué gusto leerte${n}. Gracias por elegirnos; te esperamos en tu próxima visita.`,
];

/** Respuesta sin IA, solo para 4–5 ★ (cuando se acabó el cupo o la IA falló). */
export function templateReply(stars: number, reviewerName: string | undefined, pick: number): string | null {
    if (stars < 4) return null;
    const first = reviewerName?.trim().split(/\s+/)[0];
    return TEMPLATES[Math.abs(pick) % TEMPLATES.length](first ? `, ${first}` : '');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cleanEmail = (v: unknown) => {
    const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
    return EMAIL_RE.test(e) ? e : undefined;
};
const clamp = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};
const TONES: ReplyTone[] = ['cercano', 'formal', 'divertido'];

/** Aplica un cambio parcial del panel sobre la configuración guardada, validando cada campo. */
export function mergeReviewAutoSettings(current: ReviewAutoSettings = {}, patch: Partial<ReviewAutoSettings> = {}, now = new Date()): ReviewAutoSettings {
    const iso = now.toISOString();
    const next: ReviewAutoSettings = { ...current };

    if (patch.alerts !== undefined) {
        const on = patch.alerts !== false;
        if (on && current.alerts === false) next.alertsSince = iso; // no avisar del historial al reactivar
        next.alerts = on;
    }
    if (patch.lowRatingMax !== undefined) next.lowRatingMax = clamp(patch.lowRatingMax, 1, 3, 3);
    if (patch.keywords !== undefined) {
        const seen = new Set<string>();
        next.keywords = (Array.isArray(patch.keywords) ? patch.keywords : [])
            .map((k) => String(k).trim().slice(0, 40))
            .filter((k) => k.length >= 2 && !seen.has(fold(k)) && !!seen.add(fold(k)))
            .slice(0, 20);
    }
    if (patch.alertEmail !== undefined) next.alertEmail = cleanEmail(patch.alertEmail);
    if (patch.contactEmail !== undefined) next.contactEmail = cleanEmail(patch.contactEmail);
    if (patch.tone !== undefined) next.tone = TONES.includes(patch.tone as ReplyTone) ? patch.tone : 'cercano';
    if (patch.toneNotes !== undefined) next.toneNotes = String(patch.toneNotes ?? '').trim().slice(0, 300) || undefined;
    if (patch.language !== undefined) next.language = patch.language === 'es' ? 'es' : 'cliente';
    if (patch.goalRating !== undefined) {
        const g = Math.round(Number(patch.goalRating) * 10) / 10;
        next.goalRating = Number.isFinite(g) ? Math.min(Math.max(g, 4), 4.9) : undefined;
    }
    if (patch.autoReply !== undefined) {
        const prev: Partial<AutoReplySettings> = current.autoReply ?? {};
        const p: Partial<AutoReplySettings> = patch.autoReply ?? {};
        const enabled = p.enabled ?? prev.enabled ?? false;
        const starsIn = p.stars ?? prev.stars ?? [4, 5];
        const stars = [...new Set(starsIn.map(Number).filter((s) => Number.isInteger(s) && s >= 1 && s <= 5))].sort();
        const a = clamp(p.delayMin ?? prev.delayMin, 5, 1440, 30);
        const b = clamp(p.delayMax ?? prev.delayMax, 5, 1440, 180);
        next.autoReply = {
            enabled,
            stars: stars.length ? stars : [4, 5],
            delayMin: Math.min(a, b),
            delayMax: Math.max(a, b),
            since: enabled && !prev.enabled ? iso : prev.since,
        };
    }
    return next;
}
