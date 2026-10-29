export interface SeoInput {
    estimated: boolean;
    name: boolean; address: boolean; phone: boolean; website: boolean; hours: boolean;
    primaryCategory: boolean; extraCategories: number | null; descriptionLength: number | null;
    rating: number | null; reviewCount: number; responseRate: number | null;
    hasCover: boolean | null; hasLogo: boolean | null; photoCount: number; recentPhotos90d: number | null;
    serviceItems: number | null; hasMenu: boolean;
    reviewsLast30d: number | null; daysSinceLastReply: number | null;
}
export interface SeoItem { key: string; block: string; label: string; points: number; max: number; mission: string }
export interface SeoResult { score: number; level: string; estimated: boolean; items: SeoItem[]; nextMission: SeoItem | null }

const CONNECT = 'Conecta tu Google Business para medir y mejorar esto';
const ratio = (v: number, target: number) => Math.min(Math.max(v / target, 0), 1);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** null = no se pudo medir (sin conexión a Google Business): 0 puntos y la misión pide conectar. */
function item(key: string, block: string, label: string, max: number, value: number | null, mission: string): SeoItem {
    const points = value === null ? 0 : round1(max * Math.min(Math.max(value, 0), 1));
    return { key, block, label, max, points, mission: value === null ? CONNECT : mission };
}
const flag = (b: boolean | null) => (b === null ? null : b ? 1 : 0);
const ifKnown = <T>(v: T | null, f: (x: T) => number) => (v === null ? null : f(v));

export function computeSeoScore(i: SeoInput): SeoResult {
    const items: SeoItem[] = [
        item('name', 'Datos básicos', 'Nombre del negocio', 3, flag(i.name), 'Completa el nombre de tu negocio en Google'),
        item('address', 'Datos básicos', 'Dirección', 5, flag(i.address), 'Agrega tu dirección exacta'),
        item('phone', 'Datos básicos', 'Teléfono', 4, flag(i.phone), 'Agrega un teléfono de contacto'),
        item('website', 'Datos básicos', 'Sitio web', 4, flag(i.website), 'Agrega tu web o tu carta digital de Wuarikes como sitio web'),
        item('hours', 'Datos básicos', 'Horario', 4, flag(i.hours), 'Publica tu horario de atención'),
        item('primary_category', 'Categorías', 'Categoría principal', 6, flag(i.primaryCategory), 'Elige la categoría principal que mejor describe tu local'),
        item('extra_categories', 'Categorías', 'Categorías adicionales', 4, ifKnown(i.extraCategories, (n) => ratio(n, 2)), 'Agrega al menos 2 categorías adicionales'),
        item('description', 'Categorías', 'Descripción', 5, ifKnown(i.descriptionLength, (n) => ratio(n, 250)), 'Escribe una descripción de al menos 250 caracteres'),
        item('rating', 'Reputación', 'Calificación', 10, ifKnown(i.rating, (r) => ratio(r - 3.5, 1)), 'Invita a todos tus clientes a opinar para subir tu promedio'),
        item('review_count', 'Reputación', 'Cantidad de reseñas', 7, Math.min(Math.log10(i.reviewCount + 1) / 2, 1), 'Consigue más reseñas con tus NFC y QR'),
        item('response_rate', 'Reputación', 'Reseñas respondidas', 8, ifKnown(i.responseRate, (r) => ratio(r, 0.8)), 'Responde al menos el 80 % de tus reseñas'),
        item('cover', 'Fotos', 'Foto de portada', 3, flag(i.hasCover), 'Sube una foto de portada'),
        item('logo', 'Fotos', 'Logo', 3, flag(i.hasLogo), 'Sube tu logo'),
        item('photo_count', 'Fotos', 'Cantidad de fotos', 8, ratio(i.photoCount, 25), `Sube ${Math.max(25 - i.photoCount, 0)} fotos más de tus platos y tu local`),
        item('recent_photos', 'Fotos', 'Fotos nuevas (90 días)', 6, ifKnown(i.recentPhotos90d, (n) => ratio(n, 3)), 'Sube 3 fotos nuevas este trimestre'),
        item('services', 'Servicios y carta', 'Servicios o platos', 5, ifKnown(i.serviceItems, (n) => ratio(n, 5)), 'Agrega al menos 5 servicios o platos en tu ficha'),
        item('menu', 'Servicios y carta', 'Carta digital', 5, flag(i.hasMenu), 'Publica tu carta digital en Wuarikes'),
        item('recent_reviews', 'Actividad', 'Reseñas de los últimos 30 días', 5, ifKnown(i.reviewsLast30d, (n) => ratio(n, 4)), 'Consigue al menos 4 reseñas al mes'),
        item('last_reply', 'Actividad', 'Respuesta reciente', 5, ifKnown(i.daysSinceLastReply, (d) => (d <= 7 ? 1 : d <= 30 ? 0.4 : 0)), 'Responde tus reseñas cada semana'),
    ];
    const score = Math.round(items.reduce((s, x) => s + x.points, 0));
    const level = score >= 90 ? 'Top del barrio' : score >= 70 ? 'Destacado' : score >= 40 ? 'En camino' : 'Por despegar';
    const pending = items.filter((x) => x.points < x.max);
    const nextMission = pending.reduce<SeoItem | null>((best, x) => (!best || x.max - x.points > best.max - best.points ? x : best), null);
    return { score, level, estimated: i.estimated, items, nextMission };
}
