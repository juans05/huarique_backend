import { BadRequestException } from '@nestjs/common';
import { applyVerticalFilter, resolveVertical } from './vertical-filter';
import { typesOfVertical } from './business-types';

const fakeQb = () => ({ andWhere: jest.fn().mockReturnThis() });

describe('applyVerticalFilter', () => {
    it('sin valor filtra solo gastronomía', () => {
        const qb = fakeQb();
        applyVerticalFilter(qb as any);
        expect(qb.andWhere).toHaveBeenCalledTimes(1);
        expect(qb.andWhere).toHaveBeenCalledWith('place.business_type IN (:...vtypes)', { vtypes: typesOfVertical('gastronomia') });
        expect(typesOfVertical('gastronomia')).toContain('restaurante');
    });

    it('un valor vacío cuenta como sin valor', () => {
        const qb = fakeQb();
        applyVerticalFilter(qb as any, '');
        expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), { vtypes: typesOfVertical('gastronomia') });
    });

    it("'belleza' filtra por sus tipos", () => {
        const qb = fakeQb();
        applyVerticalFilter(qb as any, 'belleza');
        expect(qb.andWhere).toHaveBeenCalledWith('place.business_type IN (:...vtypes)', { vtypes: ['barberia', 'peluqueria', 'spa'] });
    });

    it("'all' no aplica ningún filtro", () => {
        const qb = fakeQb();
        applyVerticalFilter(qb as any, 'all');
        expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it("un rubro inválido lanza 400 en español y no toca la consulta", () => {
        const qb = fakeQb();
        expect(() => applyVerticalFilter(qb as any, 'xyz')).toThrow(BadRequestException);
        expect(() => applyVerticalFilter(qb as any, 'xyz')).toThrow('Rubro no válido');
        expect(() => applyVerticalFilter(qb as any, 'toString')).toThrow(BadRequestException);
        expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('respeta el alias de la tabla', () => {
        const qb = fakeQb();
        applyVerticalFilter(qb as any, 'salud', 'p');
        expect(qb.andWhere).toHaveBeenCalledWith('p.business_type IN (:...vtypes)', { vtypes: typesOfVertical('salud') });
    });
});

describe('resolveVertical', () => {
    it('gastronomía por defecto, null para all, el rubro tal cual si es válido', () => {
        expect(resolveVertical(undefined)).toBe('gastronomia');
        expect(resolveVertical('all')).toBeNull();
        expect(resolveVertical('mascotas')).toBe('mascotas');
        expect(() => resolveVertical('Belleza')).toThrow(BadRequestException);
    });
});
