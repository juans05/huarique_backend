import { sanitizeMenu } from './menu-import.util';

describe('sanitizeMenu', () => {
    it('descarta categorías/platos vacíos, normaliza precios y tipos', () => {
        const out = sanitizeMenu({
            categories: [
                { name: ' Ceviches ', categoryType: 'raro', dishes: [{ name: 'Clásico', price: '38.456' }, { name: '  ' }, { name: 'Mixto', price: -5 }, { name: 'Sin precio' }] },
                { name: '', dishes: [{ name: 'huérfano' }] },
            ],
        });
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ name: 'Ceviches', categoryType: 'food' });
        expect(out[0].dishes.map((d) => [d.name, d.price])).toEqual([
            ['Clásico', 38.46],
            ['Mixto', null],
            ['Sin precio', null],
        ]);
    });

    it('tolera basura y respeta el tope de platos', () => {
        expect(sanitizeMenu(null)).toEqual([]);
        const many = [{ name: 'X', dishes: Array.from({ length: 400 }, (_, i) => ({ name: `p${i}` })) }];
        expect(sanitizeMenu(many)[0].dishes).toHaveLength(300);
    });
});
