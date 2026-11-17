import { ownPhotoUrls } from './checkin-photos';

describe('ownPhotoUrls', () => {
    const base = 'https://res.cloudinary.com/wuarikes/image/upload/v1/wuarike/places/';

    it('deja pasar solo fotos de nuestra cuenta, sin repetir', () => {
        expect(
            ownPhotoUrls([`${base}a.jpg`, `${base}a.jpg`, `${base}b.jpg`], 'wuarikes'),
        ).toEqual([`${base}a.jpg`, `${base}b.jpg`]);
    });

    it('descarta otras cuentas, otros dominios, videos, rutas con .. y valores vacíos', () => {
        expect(
            ownPhotoUrls(
                [
                    'https://res.cloudinary.com/otra/image/upload/v1/a.jpg',
                    'https://evil.example.com/a.jpg',
                    'https://res.cloudinary.com/wuarikes/video/upload/v1/a.mp4',
                    'https://res.cloudinary.com/wuarikes/image/upload/../../otra/image/upload/a.jpg',
                    'https://res.cloudinary.com/wuarikes/image/upload/v1/a b.jpg',
                    undefined,
                    null,
                    '',
                ],
                'wuarikes',
            ),
        ).toEqual([]);
    });

    it('sin cuenta configurada no deja pasar nada', () => {
        expect(ownPhotoUrls([`${base}a.jpg`], undefined)).toEqual([]);
    });
});
