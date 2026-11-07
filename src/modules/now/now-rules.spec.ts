import { canSee, computeExpiresAt, promoVisibleUntil, shouldHideByVotes } from './now-rules';

describe('now-rules', () => {
  const t0 = new Date('2026-11-07T12:00:00Z');
  const h = (n: number) => new Date(t0.getTime() + n * 3600_000);
  it('base 24 h', () => expect(computeExpiresAt(t0, 0, 0, 0)).toEqual(h(24)));
  it('👍 y ✅ suman, 👎 resta', () => expect(computeExpiresAt(t0, 3, 1, 2)).toEqual(h(28)));
  it('tope 72 h', () => expect(computeExpiresAt(t0, 500, 0, 0)).toEqual(h(72)));
  it('nunca antes de publicarse', () => expect(computeExpiresAt(t0, 0, 99, 0)).toEqual(t0));
  it('oculta con margen 5', () => {
    expect(shouldHideByVotes(1, 6, 0)).toBe(true);
    expect(shouldHideByVotes(1, 5, 0)).toBe(false);
  });
  it('promo usa endsAt', () => expect(promoVisibleUntil({ startsAt: null, endsAt: h(5), createdAt: t0 })).toEqual(h(5)));
  it('promo sin fin: 24 h desde inicio', () => expect(promoVisibleUntil({ startsAt: h(2), endsAt: null, createdAt: t0 })).toEqual(h(26)));
  it('promo sin fechas: 24 h desde creada', () => expect(promoVisibleUntil({ startsAt: null, endsAt: null, createdAt: t0 })).toEqual(h(24)));
  it('friends solo para la lista', () => {
    expect(canSee('friends', 'a', 'b', true, false)).toBe(false);
    expect(canSee('friends', 'a', 'b', false, true)).toBe(true);
    expect(canSee('followers', 'a', 'b', true, false)).toBe(true);
    expect(canSee('followers', 'a', null, false, false)).toBe(false);
    expect(canSee('all', 'a', null, false, false)).toBe(true);
    expect(canSee('friends', 'a', 'a', false, false)).toBe(true); // el autor siempre ve lo suyo
  });
});
