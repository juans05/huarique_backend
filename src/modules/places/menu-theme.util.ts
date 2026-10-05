export interface MenuTheme {
    /** Colores de fondo (hex #RRGGBB). El color del texto se calcula solo para que siempre se lea. */
    headerBg?: string;
    bodyBg?: string;
    footerBg?: string;
    /** Color de acento: botones, precios y la categoría activa. */
    accent?: string;
    /** Frase corta bajo el nombre del local (ej. "Cevichería criolla desde 1998"). */
    tagline?: string;
    /** Título sobre las categorías (ej. "Nuestra carta"). */
    menuTitle?: string;
    /** Aviso sobre los platos (ej. "Precios incluyen IGV"). */
    notice?: string;
    /** Texto del pie (ej. dirección, horarios, reservas). */
    footerText?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const COLOR_KEYS = ['headerBg', 'bodyBg', 'footerBg', 'accent'] as const;
const TEXT_LIMITS = { tagline: 90, menuTitle: 60, notice: 160, footerText: 240 } as const;

/** Quita caracteres de control y espacios sobrantes; el panel lo muestra como texto, nunca como HTML. */
const clean = (v: unknown, max: number) =>
    typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

/**
 * Lo que llega del navegador no es confiable: solo se aceptan colores hex válidos y textos cortos.
 * Un valor vacío o inválido se descarta (vuelve al diseño por defecto).
 */
export function sanitizeMenuTheme(raw: unknown): MenuTheme {
    const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out: MenuTheme = {};
    for (const k of COLOR_KEYS) {
        const v = typeof src[k] === 'string' ? (src[k] as string).trim() : '';
        if (HEX.test(v)) out[k] = v.toUpperCase();
    }
    for (const [k, max] of Object.entries(TEXT_LIMITS)) {
        const v = clean(src[k], max);
        if (v) (out as Record<string, string>)[k] = v;
    }
    return out;
}
