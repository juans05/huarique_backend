import { MAX_PUBLIC_PHOTOS, ownPhotoUrls } from './checkin-photos';

describe('ownPhotoUrls', () => {
    const base = 'https://res.cloudinary.com/wuarikes/image/upload/v1789841985/wuarike/places/';

    it('deja pasar la forma exacta de /upload/image, sin repetir', () => {
        expect(
            ownPhotoUrls([`${base}a1B2_c-3.jpg`, `${base}a1B2_c-3.jpg`, `${base}b.webp`, `${base}c.png`], 'wuarikes'),
        ).toEqual([`${base}a1B2_c-3.jpg`, `${base}b.webp`, `${base}c.png`]);
    });

    it('descarta otras cuentas, dominios, videos, carpetas y formatos', () => {
        expect(
            ownPhotoUrls(
                [
                    'https://res.cloudinary.com/otra/image/upload/v1/wuarike/places/a.jpg',
                    'https://evil.example.com/a.jpg',
                    'https://res.cloudinary.com/wuarikes/video/upload/v1/wuarike/places/a.mp4',
                    'https://res.cloudinary.com/wuarikes/image/upload/v1/otra-carpeta/a.jpg',
                    `${base}a.gif`,
                    `${base}a.jpg.exe`,
                    undefined,
                    null,
                    '',
                ],
                'wuarikes',
            ),
        ).toEqual([]);
    });

    it('descarta transformaciones, query, fragmento, %-encoding, "..", espacios y http', () => {
        expect(
            ownPhotoUrls(
                [
                    'https://res.cloudinary.com/wuarikes/image/upload/l_fetch:aHR0cHM6Ly9ldmlsLmNvbQ==/v1/wuarike/places/a.jpg',
                    'https://res.cloudinary.com/wuarikes/image/upload/e_blur:2000/v1/wuarike/places/a.jpg',
                    `${base}a.jpg?x=1`,
                    `${base}a.jpg#frag`,
                    `${base}%2e%2e/a.jpg`,
                    `${base}../../../otra/a.jpg`,
                    `${base}a b.jpg`,
                    `${base}a.jpg\n`,
                    base.replace('https', 'http') + 'a.jpg',
                ],
                'wuarikes',
            ),
        ).toEqual([]);
    });

    it('con mucho material solo deja pasar el tope', () => {
        const many = Array.from({ length: 20 }, (_, i) => `${base}id${i}.jpg`);
        expect(ownPhotoUrls(many, 'wuarikes')).toHaveLength(MAX_PUBLIC_PHOTOS);
    });

    it('la cuenta se trata literal (el punto no es comodín) y sin cuenta no pasa nada', () => {
        expect(ownPhotoUrls([`${base}a.jpg`], 'wuarik.s')).toEqual([]);
        expect(ownPhotoUrls([`${base}a.jpg`], undefined)).toEqual([]);
    });
});
