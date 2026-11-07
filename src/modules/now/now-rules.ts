// Reglas puras de "Ahora": sin base de datos ni Nest, para probarlas sin nada más.

export const NOW_RADIUS_M = 300;
export const BASE_HOURS = 24;
export const MAX_HOURS = 72;
export const HIDE_MARGIN = 5;
export const REPORTS_TO_HIDE = 3;
export const POSTS_PER_HOUR = 5;
export const REPORTS_PER_DAY = 20;
export const PROMO_DEFAULT_HOURS = 24;

const HOUR_MS = 3600_000;

/** Vence a las 24 h + (👍 + ✅ − 👎) h, entre 0 y 72 h desde que se publicó. */
export function computeExpiresAt(createdAt: Date, likes: number, dislikes: number, checks: number): Date {
  const hours = Math.min(MAX_HOURS, Math.max(0, BASE_HOURS + likes + checks - dislikes));
  return new Date(createdAt.getTime() + hours * HOUR_MS);
}

/** Se oculta cuando 👎 − (👍 + ✅) llega al margen. */
export function shouldHideByVotes(likes: number, dislikes: number, checks: number): boolean {
  return dislikes - (likes + checks) >= HIDE_MARGIN;
}

/** Hasta cuándo se ve una promo en "Ahora": endsAt, o 24 h desde startsAt (o createdAt). */
export function promoVisibleUntil(p: { startsAt: Date | null; endsAt: Date | null; createdAt: Date }): Date {
  if (p.endsAt) return p.endsAt;
  return new Date((p.startsAt ?? p.createdAt).getTime() + PROMO_DEFAULT_HOURS * HOUR_MS);
}

export type NowVisibility = 'all' | 'followers' | 'friends';

export function canSee(
  visibility: NowVisibility,
  authorId: string,
  viewerId: string | null,
  viewerFollowsAuthor: boolean,
  viewerInAuthorFriends: boolean,
): boolean {
  if (viewerId === authorId) return true;
  if (visibility === 'all') return true;
  if (!viewerId) return false;
  return visibility === 'followers' ? viewerFollowsAuthor : viewerInAuthorFriends;
}
