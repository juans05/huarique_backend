import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { toCents, calculateTotals, canTransition, assertCanCancel, newPublicToken } from './order-rules';

describe('order-rules', () => {
    it('toCents redondea decimales de la carta', () => {
        expect(toCents('25.00')).toBe(2500);
        expect(toCents('79.99')).toBe(7999);
        expect(toCents(null)).toBe(0);
    });

    it('con IGV incluido el total es la suma y el IGV se informa', () => {
        const totals = calculateTotals([{ unitPrice: 2500, quantity: 2 }, { unitPrice: 1000, quantity: 1 }], 0, true);
        expect(totals).toEqual({ subtotal: 6000, deliveryFee: 0, igv: 6000 - Math.round(6000 / 1.18), total: 6000 });
    });

    it('sin IGV incluido se suma 18 % y la tarifa de delivery', () => {
        const totals = calculateTotals([{ unitPrice: 1000, quantity: 1 }], 500, false);
        expect(totals).toEqual({ subtotal: 1000, deliveryFee: 500, igv: 180, total: 1680 });
    });

    it('transiciones válidas e inválidas', () => {
        expect(canTransition('PENDIENTE_PAGO', 'NUEVO')).toBe(true);
        expect(canTransition('NUEVO', 'EN_PREPARACION')).toBe(true);
        expect(canTransition('EN_PREPARACION', 'LISTO')).toBe(true);
        expect(canTransition('LISTO', 'ENTREGADO')).toBe(true);
        expect(canTransition('NUEVO', 'LISTO')).toBe(false);
        expect(canTransition('ENTREGADO', 'CANCELADO')).toBe(false);
        expect(canTransition('PENDIENTE_PAGO', 'EN_PREPARACION')).toBe(false);
    });

    it('cancelar: caja cancela NUEVO, solo gerente EN_PREPARACION, nadie LISTO, cocina nunca', () => {
        expect(() => assertCanCancel('NUEVO', 'agente')).not.toThrow();
        expect(() => assertCanCancel('EN_PREPARACION', 'agente')).toThrow(ForbiddenException);
        expect(() => assertCanCancel('EN_PREPARACION', 'supervisor')).not.toThrow();
        expect(() => assertCanCancel('LISTO', 'admin')).toThrow(BadRequestException);
        expect(() => assertCanCancel('NUEVO', 'cocina')).toThrow(ForbiddenException);
    });

    it('newPublicToken es hex de 32 caracteres y no se repite', () => {
        const first = newPublicToken();
        expect(first).toMatch(/^[0-9a-f]{32}$/);
        expect(newPublicToken()).not.toBe(first);
    });
});
