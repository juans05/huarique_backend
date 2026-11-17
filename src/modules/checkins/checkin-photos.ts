// El check-in recibe URLs que manda el cliente y de ahí salen la galería y la portada
// públicas del local. Solo pasan las subidas a nuestra propia cuenta de Cloudinary
// (las que devuelve POST /upload/image); cualquier otra URL se ignora.
export function ownPhotoUrls(
    urls: Array<string | null | undefined>,
    cloudName: string | undefined = process.env.CLOUDINARY_CLOUD_NAME,
): string[] {
    if (!cloudName) return [];
    const prefix = `https://res.cloudinary.com/${cloudName}/image/upload/`;
    const ok = urls.filter(
        (u): u is string => typeof u === 'string' && u.startsWith(prefix) && !u.includes('..') && !/\s/.test(u),
    );
    return [...new Set(ok)];
}
