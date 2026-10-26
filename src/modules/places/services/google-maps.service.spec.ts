import { GoogleMapsService } from './google-maps.service';

const svc = () => new GoogleMapsService({ get: () => 'KEY' } as any);
const reply = (status: number, body: any) => jest.spyOn(global, 'fetch').mockResolvedValue({ ok: status < 400, status, json: async () => body } as any);

afterEach(() => jest.restoreAllMocks());

describe('GoogleMapsService (Places API New)', () => {
    it('trae reseñas con la clave en el header y las devuelve con los nombres de la API legacy', async () => {
        const fetchMock = reply(200, {
            rating: 4.6, userRatingCount: 120,
            reviews: [{ rating: 5, text: { text: 'Buen corte' }, authorAttribution: { displayName: 'Ana', photoUri: 'https://foto' }, relativePublishTimeDescription: 'hace 2 días', publishTime: '2026-10-24T15:00:00Z' }],
        });
        const res = await svc().getPlaceReviews('ChIJ123');
        const [url, init] = fetchMock.mock.calls[0] as any[];
        expect(url).toBe('https://places.googleapis.com/v1/places/ChIJ123?languageCode=es');
        expect(init.headers).toMatchObject({ 'X-Goog-Api-Key': 'KEY', 'X-Goog-FieldMask': 'rating,userRatingCount,reviews' });
        expect(res).toEqual({
            rating: 4.6, totalReviews: 120,
            reviews: [{ author_name: 'Ana', profile_photo_url: 'https://foto', rating: 5, text: 'Buen corte', relative_time_description: 'hace 2 días', time: Date.parse('2026-10-24T15:00:00Z') / 1000 }],
        });
    });

    it('403 explica qué activar en Google Cloud; 400 es un Place ID mal copiado', async () => {
        reply(403, { error: { status: 'PERMISSION_DENIED', message: 'Places API (New) has not been used' } });
        await expect(svc().getPlaceReviews('x')).rejects.toThrow(/Places API \(New\)/);
        reply(400, { error: { status: 'INVALID_ARGUMENT' } });
        await expect(svc().getPlaceReviews('x')).rejects.toThrow(/Place ID/);
    });

    it('busca por texto y encuentra el Place ID', async () => {
        const fetchMock = reply(200, { places: [{ id: 'ChIJabc', displayName: { text: 'El Sultán' }, formattedAddress: 'Lima' }] });
        expect(await svc().searchPlaces('sultan')).toEqual([{ googlePlaceId: 'ChIJabc', name: 'El Sultán', address: 'Lima', source: 'google' }]);
        expect(JSON.parse((fetchMock.mock.calls[0] as any[])[1].body)).toMatchObject({ textQuery: 'sultan', includedType: 'restaurant' });
        expect(await svc().findPlaceId('El Sultán', 'Lima')).toBe('ChIJabc');
    });
});
