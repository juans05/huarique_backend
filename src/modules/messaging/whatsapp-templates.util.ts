export type TemplateCategory = 'MARKETING' | 'UTILITY';

export interface CreateTemplateInput {
    name: string;
    language: string;
    category: TemplateCategory;
    body: string;
    /** Un ejemplo por cada variable {{n}} del cuerpo: Meta los exige para aprobar la plantilla. */
    bodyExamples?: string[];
    footer?: string;
}

/** Cantidad de variables {{1}}, {{2}}... del cuerpo (el número más alto). */
export function countBodyVariables(body: string): number {
    const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    return nums.length ? Math.max(...nums) : 0;
}

/** Devuelve el mensaje de error si la plantilla no cumple las reglas básicas de Meta; null si está bien. */
export function validateTemplateInput(t: CreateTemplateInput): string | null {
    if (!/^[a-z0-9_]{1,512}$/.test(t.name)) return 'El nombre solo puede tener minúsculas, números y guion bajo (ej. promo_fin_de_semana).';
    if (!['MARKETING', 'UTILITY'].includes(t.category)) return 'La categoría debe ser MARKETING o UTILITY.';
    if (!t.body?.trim()) return 'El cuerpo es obligatorio.';
    if (t.body.length > 1024) return 'El cuerpo no puede pasar de 1024 caracteres.';
    const vars = countBodyVariables(t.body);
    if (vars > 0 && (t.bodyExamples?.length ?? 0) < vars) return `Faltan ejemplos: el cuerpo tiene ${vars} variable(s) y Meta pide un ejemplo por cada una.`;
    if (/^\s*\{\{|\}\}\s*$/.test(t.body)) return 'El cuerpo no puede empezar ni terminar con una variable.';
    return null;
}

export function buildCreateTemplatePayload(t: CreateTemplateInput) {
    const vars = countBodyVariables(t.body);
    const components: any[] = [
        {
            type: 'BODY',
            text: t.body,
            ...(vars > 0 ? { example: { body_text: [t.bodyExamples!.slice(0, vars)] } } : {}),
        },
    ];
    if (t.footer?.trim()) components.push({ type: 'FOOTER', text: t.footer.trim() });
    return { name: t.name, language: t.language, category: t.category, components };
}

/** Reemplaza {nombre} en cada variable de la campaña; si el contacto no tiene nombre usa "Amigo" (Meta no acepta vacíos). */
export function renderVariables(variables: string[] | null | undefined, contact: { name?: string | null }): string[] {
    const name = contact.name?.trim() || 'Amigo';
    return (variables ?? []).map((v) => (v.replace(/\{nombre\}/gi, name).trim() || 'Amigo'));
}

/** Teléfonos válidos y sin repetir (misma persona en varias conversaciones recibe un solo mensaje). */
export function dedupeRecipients<T extends { phone?: string | null }>(list: T[]): (T & { phone: string })[] {
    const seen = new Set<string>();
    const out: (T & { phone: string })[] = [];
    for (const r of list) {
        const digits = (r.phone ?? '').replace(/\D/g, '');
        if (digits.length < 8 || seen.has(digits)) continue;
        seen.add(digits);
        out.push({ ...r, phone: digits });
    }
    return out;
}

/** ¿Ya llegaron todos los resultados? Devuelve el estado final o null si aún faltan. */
export function finalStatus(sent: number, failed: number, total: number): 'COMPLETED' | 'FAILED' | null {
    if (total <= 0 || sent + failed < total) return null;
    return sent > 0 ? 'COMPLETED' : 'FAILED';
}
