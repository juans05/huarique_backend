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
