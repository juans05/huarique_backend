// Máximo de fotos de un mismo check-in que llegan a la galería pública del local.
export const MAX_PUBLIC_PHOTOS = 3;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// El check-in recibe URLs que manda el cliente y de ahí salen la galería y la portada
// públicas del local. Solo pasa la forma exacta que devuelve POST /upload/image:
//   https://res.cloudinary.com/<cuenta>/image/upload/v<versión>/wuarike/places/<id>.<jpg|jpeg|png|webp>
// Sin segmentos de transformación (podrían traer overlays de otras URLs), sin query,
// sin fragmento, sin %-encoding ni rutas con "..". Cualquier otra URL se ignora.
export function ownPhotoUrls(
    urls: Array<string | null | undefined>,
    cloudName: string | undefined = process.env.CLOUDINARY_CLOUD_NAME,
): string[] {
    if (!cloudName) return [];
    const re = new RegExp(
        `^https://res\\.cloudinary\\.com/${escapeRe(cloudName)}/image/upload/v\\d{1,12}/wuarike/places/[A-Za-z0-9_-]{1,64}\\.(?:jpe?g|png|webp)$`,
    );
    const ok = urls.filter((u): u is string => typeof u === 'string' && re.test(u));
    return [...new Set(ok)].slice(0, MAX_PUBLIC_PHOTOS);
}
