import { moduleForPath } from './team-modules';

describe('moduleForPath', () => {
    it('ata cada ruta de negocio a su sección', () => {
        const p = '/api/business/places/abc';
        expect(moduleForPath(`${p}/agenda/day?date=2026-10-23`)).toBe('agenda');
        expect(moduleForPath(`${p}/orders/cash/open`)).toBe('caja');
        expect(moduleForPath(`${p}/orders/kds`)).toBe('cocina');
        expect(moduleForPath(`${p}/orders/tables-board`)).toBe('mesas');
        expect(moduleForPath(`${p}/orders?status=NUEVO`)).toBe('pedidos');
        expect(moduleForPath('/api/business/contacts?placeId=abc')).toBe('clientes');
        expect(moduleForPath('/api/business/conversations/abc')).toBe('chat');
    });

    it('lo compartido entre secciones queda solo con el nivel', () => {
        expect(moduleForPath('/api/business/places/abc/orders/me')).toBeNull();
        expect(moduleForPath('/api/business/places/abc/orders/123/status')).toBeNull();
        expect(moduleForPath('/api/business/places/abc/orders/tabs/1/close')).toBeNull();
        expect(moduleForPath('/api/business/places/abc/team')).toBeNull();
        expect(moduleForPath('/api/public/agenda/abc')).toBeNull();
        expect(moduleForPath('/api/business/contactsx')).toBeNull();
    });
});
