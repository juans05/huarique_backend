import { BadRequestException } from '@nestjs/common';
import type { SelectQueryBuilder } from 'typeorm';
import type { Place } from './entities/place.entity';
import { VERTICALS, typesOfVertical, type Vertical } from './business-types';

/** Sin `vertical`, la API pública devuelve solo gastronomía (cero regresiones para las apps existentes). */
export const DEFAULT_VERTICAL: Vertical = 'gastronomia';

/** Valor de `vertical` que desactiva el filtro. */
export const ALL_VERTICALS = 'all';

/** Sin valor → gastronomía; `'all'` → null (sin filtro); rubro válido → ese rubro; otro → 400. */
export function resolveVertical(vertical?: string | null): Vertical | null {
    if (vertical === undefined || vertical === null || vertical === '') return DEFAULT_VERTICAL;
    if (vertical === ALL_VERTICALS) return null;
    if (!Object.prototype.hasOwnProperty.call(VERTICALS, vertical)) throw new BadRequestException('Rubro no válido');
    return vertical as Vertical;
}

/** Restringe la consulta a los tipos de negocio del rubro pedido. */
export function applyVerticalFilter(qb: SelectQueryBuilder<Place>, vertical?: string | null, alias = 'place'): void {
    const resolved = resolveVertical(vertical);
    if (resolved) qb.andWhere(`${alias}.business_type IN (:...vtypes)`, { vtypes: typesOfVertical(resolved) });
}
