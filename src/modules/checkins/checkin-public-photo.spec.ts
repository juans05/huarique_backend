import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckinsService } from './checkins.service';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { MAX_PUBLIC_PHOTOS } from './checkin-photos';
import { PlacePhoto } from '../places/entities/place-photo.entity';
import { Place } from '../places/entities/place.entity';

const OWN = 'https://res.cloudinary.com/wuarikes/image/upload/v1789841985/wuarike/places/a.jpg';

function build(place: { coverImageUrl: string | null }, suspicious = false) {
    const calls = { insert: [] as any[], update: [] as any[] };
    const manager = {
        create: (_e: any, v: any) => v,
        save: async (v: any) => (Array.isArray(v) ? v : { ...v, id: 'c1' }),
        insert: async (e: any, v: any) => calls.insert.push([e, v]),
        update: async (e: any, w: any, v: any) => calls.update.push([e, w, v]),
    };
    const ok = { isValid: true };
    const addPoints = jest.fn();
    const svc = new CheckinsService(
        {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
        { addPoints } as any,
        { findOne: async () => ({ id: 'p1', name: 'X', latitude: -12, longitude: -77, ...place }), updateRating: jest.fn() } as any,
        { log: jest.fn() } as any,
        {
            validateCooldown: async () => ok,
            validateDailyLimit: async () => ok,
            validateProximity: () => ok,
            validateDevice: () => (suspicious ? { suspicious: true, reason: 'MOCKED' } : { suspicious: false }),
            validateSpeed: async () => ({ suspicious: false }),
        } as any,
        { updateStreak: jest.fn(), checkAndAwardBadges: jest.fn() } as any,
        { transaction: async (cb: any) => cb(manager) } as any,
    );
    return { svc, calls, addPoints };
}

const dto = (photoUrl?: string) => ({ placeId: 'p1', latitude: -12, longitude: -77, photoUrl }) as any;

describe('check-in con foto → galería y portada del local', () => {
    beforeAll(() => { process.env.CLOUDINARY_CLOUD_NAME = 'wuarikes'; });

    it('local sin portada: guarda la foto, la pone de portada y da 10 + 10', async () => {
        const { svc, calls, addPoints } = build({ coverImageUrl: null });
        await svc.create('u1', dto(OWN));
        expect(calls.insert).toEqual([[PlacePhoto, [{ url: OWN, placeId: 'p1', userId: 'u1' }]]]);
        expect(calls.update[0][0]).toBe(Place);
        expect(calls.update[0][2]).toEqual({ coverImageUrl: OWN });
        expect(addPoints).toHaveBeenCalledWith('u1', 20);
    });

    it('local con portada: suma a la galería, la portada solo se escribe si sigue vacía, y da 10 + 5', async () => {
        const { svc, calls, addPoints } = build({ coverImageUrl: 'https://x/cover.jpg' });
        await svc.create('u1', dto(OWN));
        expect(calls.insert).toHaveLength(1);
        expect(calls.update[0][1].coverImageUrl.type).toBe('isNull'); // UPDATE ... WHERE cover_image_url IS NULL
        expect(addPoints).toHaveBeenCalledWith('u1', 15);
    });

    it('URL ajena a nuestra cuenta: no entra a la galería ni es "primera foto"', async () => {
        const { svc, calls, addPoints } = build({ coverImageUrl: null });
        await svc.create('u1', dto('https://evil.example.com/a.jpg'));
        expect(calls.insert).toEqual([]);
        expect(calls.update).toEqual([]);
        expect(addPoints).toHaveBeenCalledWith('u1', 15);
    });

    it('un check-in con muchas fotos publica solo hasta el tope', async () => {
        const { svc, calls } = build({ coverImageUrl: null });
        const many = Array.from({ length: 5 }, (_, i) => OWN.replace('a.jpg', `id${i}.jpg`));
        await svc.create('u1', { ...dto(), photos: many });
        expect(calls.insert[0][1]).toHaveLength(MAX_PUBLIC_PHOTOS);
    });

    it('el DTO rechaza más de 5 fotos', async () => {
        const make = (n: number) =>
            plainToInstance(CreateCheckinDto, {
                placeId: '11111111-1111-4111-8111-111111111111',
                latitude: -12,
                longitude: -77,
                photos: Array.from({ length: n }, (_, i) => `u${i}`),
            });
        expect(await validate(make(5))).toHaveLength(0);
        expect((await validate(make(6))).map((e) => e.property)).toEqual(['photos']);
    });

    it('check-in sospechoso: no publica nada ni da puntos', async () => {
        const { svc, calls, addPoints } = build({ coverImageUrl: null }, true);
        await svc.create('u1', dto(OWN));
        expect(calls.insert).toEqual([]);
        expect(calls.update).toEqual([]);
        expect(addPoints).not.toHaveBeenCalled();
    });
});
