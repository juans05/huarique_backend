import { createHmac, timingSafeEqual } from 'crypto';

// Clave de cada tarjeta: abre su historial y su Wallet. El teléfono solo no basta (no es un secreto).
// Se deriva del id con una clave del servidor, así no hace falta guardarla en la base.
function secret(): string {
  const s = process.env.LOYALTY_CARD_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('Falta JWT_SECRET para firmar las tarjetas');
  return s;
}

export function cardKey(cardId: string): string {
  return createHmac('sha256', secret()).update(`loyalty-card:${cardId}`).digest('hex').slice(0, 32);
}

export function isValidCardKey(cardId: string, key: unknown): boolean {
  if (typeof key !== 'string' || key.length !== 32) return false;
  return timingSafeEqual(Buffer.from(key), Buffer.from(cardKey(cardId)));
}
