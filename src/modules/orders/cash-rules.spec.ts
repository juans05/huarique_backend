import { receiptCode, receiptCustomerError } from './cash-rules';

describe('receiptCustomerError', () => {
    it('ticket no pide datos', () => {
        expect(receiptCustomerError('TICKET', {}, 999999)).toBeNull();
    });
    it('factura exige RUC, razón social y dirección', () => {
        expect(receiptCustomerError('FACTURA', { customerDocType: 'DNI', customerDocNumber: '12345678' }, 1000)).toMatch(/RUC/);
        expect(receiptCustomerError('FACTURA', { customerDocType: 'RUC', customerDocNumber: '20123456789' }, 1000)).toMatch(/razón social/);
        expect(receiptCustomerError('FACTURA', { customerDocType: 'RUC', customerDocNumber: '20123456789', customerName: 'ACME SAC' }, 1000)).toMatch(/dirección/);
        expect(receiptCustomerError('FACTURA', { customerDocType: 'RUC', customerDocNumber: '20123456789', customerName: 'ACME SAC', customerAddress: 'Av. Lima 1' }, 1000)).toBeNull();
    });
    it('boleta: DNI de 8 dígitos y cliente obligatorio desde S/ 700', () => {
        expect(receiptCustomerError('BOLETA', {}, 69999)).toBeNull();
        expect(receiptCustomerError('BOLETA', {}, 70000)).toMatch(/S\/ 700/);
        expect(receiptCustomerError('BOLETA', { customerDocType: 'DNI', customerDocNumber: '123' }, 100)).toMatch(/8 dígitos/);
        expect(receiptCustomerError('BOLETA', { customerDocType: 'DNI', customerDocNumber: '12345678', customerName: 'Ana' }, 80000)).toBeNull();
    });
});

describe('receiptCode', () => {
    it('rellena el número a 8 dígitos', () => {
        expect(receiptCode('B001', 1)).toBe('B001-00000001');
    });
});
