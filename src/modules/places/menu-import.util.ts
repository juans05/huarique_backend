export type ImportedCategoryType = 'food' | 'drink' | 'dessert' | 'other';

export interface ImportedDish {
    name: string;
    description?: string;
    price?: number | null;
}

export interface ImportedCategory {
    name: string;
    categoryType: ImportedCategoryType;
    dishes: ImportedDish[];
}

const MAX_CATEGORIES = 30;
const MAX_DISHES = 300;
const TYPES: ImportedCategoryType[] = ['food', 'drink', 'dessert', 'other'];

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Lo que sale de la IA (o del cliente tras editar la vista previa) no es
 * confiable: se normaliza todo y se descarta lo vacío antes de tocar la BD.
 */
export function sanitizeMenu(raw: unknown): ImportedCategory[] {
    const list = Array.isArray((raw as any)?.categories) ? (raw as any).categories : Array.isArray(raw) ? raw : [];
    let dishCount = 0;
    const out: ImportedCategory[] = [];

    for (const c of list.slice(0, MAX_CATEGORIES)) {
        const name = text(c?.name, 80);
        if (!name) continue;
        const dishes: ImportedDish[] = [];
        for (const d of Array.isArray(c?.dishes) ? c.dishes : []) {
            const dishName = text(d?.name, 120);
            if (!dishName || dishCount >= MAX_DISHES) continue;
            const price = Number(d?.price);
            dishes.push({
                name: dishName,
                description: text(d?.description, 400) || undefined,
                price: d?.price != null && d?.price !== '' && Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : null,
            });
            dishCount++;
        }
        out.push({
            name,
            categoryType: TYPES.includes(c?.categoryType) ? c.categoryType : 'food',
            dishes,
        });
    }
    return out;
}
