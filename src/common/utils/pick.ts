/**
 * Copia solo los campos permitidos de un body sin validar. Evita que el cliente sobrescriba
 * columnas que no le corresponden (id, placeId, dueño…) al hacer `create({ ...body })` o `update(id, body)`.
 */
export function pick<T extends object, K extends keyof T>(source: unknown, keys: readonly K[]): Partial<Pick<T, K>> {
    const out: Partial<Pick<T, K>> = {};
    if (!source || typeof source !== 'object') return out;
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            (out as any)[key] = (source as any)[key];
        }
    }
    return out;
}
