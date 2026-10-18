import {
    BUSINESS_TYPES,
    VERTICALS,
    getVerticalConfig,
    isBusinessType,
    publicBusinessTypes,
    typesOfVertical,
    verticalOf,
} from './business-types';

describe('business-types', () => {
    it('cada tipo pertenece a un rubro existente y cada rubro tiene todos sus campos', () => {
        for (const t of Object.values(BUSINESS_TYPES)) expect(VERTICALS[t.vertical]).toBeDefined();
        for (const v of Object.values(VERTICALS)) {
            expect(v.label && v.labels.catalog && v.labels.catalogItem && v.labels.customer && v.botPersona).toBeTruthy();
            expect(v.modules.length).toBeGreaterThan(0);
        }
    });

    it('restaurante es gastronomía con mesas y cocina; barbería es belleza sin ellas', () => {
        expect(getVerticalConfig('restaurante').modules).toEqual(expect.arrayContaining(['mesas', 'cocina', 'pedidos']));
        const b = getVerticalConfig('barberia');
        expect(b.vertical).toBe('belleza');
        expect(b.modules).not.toEqual(expect.arrayContaining(['mesas']));
        expect(b.teamRoles).not.toContain('cocina');
    });

    it('un tipo desconocido cae en gastronomía', () => {
        expect(verticalOf('xyz')).toBe('gastronomia');
        expect(isBusinessType('xyz')).toBe(false);
        expect(typesOfVertical('gastronomia')).toEqual(['restaurante', 'comida_rapida', 'cafeteria', 'heladeria']);
    });

    it('los rubros que no son gastronomía no incluyen pedidos, cocina ni mesas', () => {
        for (const [key, v] of Object.entries(VERTICALS)) {
            if (key === 'gastronomia') continue;
            expect(v.modules).not.toEqual(expect.arrayContaining(['pedidos']));
            expect(v.modules).not.toEqual(expect.arrayContaining(['cocina']));
            expect(v.modules).not.toEqual(expect.arrayContaining(['mesas']));
        }
    });

    it('GET /places/business-types expone rubros con catalogLabel y tipos, sin modules ni botPersona', () => {
        const { verticals } = publicBusinessTypes();
        expect(verticals.map((v) => v.key)).toEqual(Object.keys(VERTICALS));
        const belleza = verticals.find((v) => v.key === 'belleza')!;
        expect(belleza.label).toBe('Belleza');
        expect(belleza.catalogLabel).toBe('Servicios');
        expect(belleza.types.map((t) => t.key)).toEqual(['barberia', 'peluqueria', 'spa']);
        for (const v of verticals) {
            expect(v).not.toHaveProperty('modules');
            expect(v).not.toHaveProperty('botPersona');
            expect(v.catalogLabel).toBe(VERTICALS[v.key].labels.catalog);
            expect(v.types.length).toBeGreaterThan(0);
        }
    });
});
