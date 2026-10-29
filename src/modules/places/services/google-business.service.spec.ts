import { GoogleBusinessService } from './google-business.service';

describe('GoogleBusinessService OAuth state', () => {
  const config: any = { get: (k: string) => ({ JWT_SECRET: 'test-secret', GOOGLE_CLIENT_ID: 'cid' } as any)[k] };
  const svc = new GoogleBusinessService(config, {} as any);
  const stateOf = (url: string) => new URL(url).searchParams.get('state')!;

  it('accepts its own state and rejects tampered or forged ones', () => {
    const state = stateOf(svc.getAuthUrl('place-1', 'user-1'));
    expect(svc.verifyState(state)).toEqual({ placeId: 'place-1', userId: 'user-1' });

    const [, sig] = state.split('.');
    const forged = Buffer.from(`place-2|user-1|${Date.now() + 60_000}`).toString('base64url');
    expect(svc.verifyState(`${forged}.${sig}`)).toBeNull();
    // Old unsigned format must no longer work.
    expect(svc.verifyState(Buffer.from('place-1|user-1').toString('base64'))).toBeNull();
    expect(svc.verifyState(undefined)).toBeNull();
  });

  it('rejects expired state', () => {
    const realNow = Date.now;
    const state = stateOf(svc.getAuthUrl('place-1', 'user-1'));
    Date.now = () => realNow() + 16 * 60_000;
    try {
      expect(svc.verifyState(state)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});

describe('GoogleBusinessService lecturas', () => {
  const config: any = { get: () => undefined };
  const place = { id: 'p1', googleAccessToken: 't', googleLocationName: 'accounts/1/locations/2' };
  const repo: any = { findOne: jest.fn().mockResolvedValue(place), update: jest.fn() };
  const svc = new GoogleBusinessService(config, repo);
  const json = (body: any) => ({ ok: true, status: 200, json: async () => body });
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  it('getRecentReviews ordena por updateTime y deja de paginar al pasar la fecha', async () => {
    fetchMock.mockResolvedValueOnce(json({
      reviews: [
        { name: 'accounts/1/locations/2/reviews/a', createTime: '2026-10-14T00:00:00Z', updateTime: '2026-10-14T00:00:00Z' },
        { name: 'accounts/1/locations/2/reviews/b', createTime: '2026-09-01T00:00:00Z', updateTime: '2026-09-01T00:00:00Z' },
      ],
      nextPageToken: 'NEXT',
    }));
    const reviews = await svc.getRecentReviews('p1', new Date('2026-10-07T00:00:00Z'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('orderBy=updateTime%20desc');
    expect(reviews.map((r) => r.name)).toEqual(['accounts/1/locations/2/reviews/a', 'accounts/1/locations/2/reviews/b']);
  });

  it('getLocationProfile pide la ficha con readMask y las fotos', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ title: 'La Huarica' }))
      .mockResolvedValueOnce(json({ mediaItems: [{ createTime: '2026-10-01T00:00:00Z' }], totalMediaItemCount: 31 }));
    const out = await svc.getLocationProfile('p1');
    expect(fetchMock.mock.calls[0][0]).toBe('https://mybusinessbusinessinformation.googleapis.com/v1/locations/2?readMask=title,phoneNumbers,categories,storefrontAddress,websiteUri,regularHours,profile,serviceItems');
    expect(fetchMock.mock.calls[1][0]).toBe('https://mybusiness.googleapis.com/v4/accounts/1/locations/2/media?pageSize=2500');
    expect(out).toEqual({ profile: { title: 'La Huarica' }, mediaItems: [{ createTime: '2026-10-01T00:00:00Z' }], totalMedia: 31 });
  });
});
