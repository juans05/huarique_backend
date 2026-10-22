import { MenuFormatterService } from './menu-formatter.service';

const build = (categories: any[]) => {
    const categoryRepo = { find: jest.fn(async () => categories) };
    return new MenuFormatterService(categoryRepo as any);
};

const dish = (over: Record<string, unknown>) => ({ description: null, price: null, kind: 'producto', durationMin: null, ...over });

describe('MenuFormatterService', () => {
    it('gastronomía (o sin businessType) conserva exactamente el formato de la carta', async () => {
        const cats = [
            { name: 'Entradas', description: 'Para empezar', dishes: [dish({ name: 'Ceviche', price: 32, description: 'Pescado del día' }), dish({ name: 'Agua' })] },
            { name: 'Postres', description: null, dishes: [] },
        ];
        const expected = [
            '## 📋 Carta Digital\n',
            '### Entradas',
            '*Para empezar*',
            '',
            '- **Ceviche** — S/ 32.00',
            '  > Pescado del día',
            '- **Agua**',
            '',
            '### Postres',
            '',
            '  *Sin platos registrados*',
            '',
        ].join('\n');
        expect(await build(cats).formatMenuToMarkdown('p1')).toBe(expected);
        expect(await build(cats).formatMenuToMarkdown('p1', 'restaurante')).toBe(expected);
        expect(await build(cats).formatMenuToMarkdown('p1', 'cafeteria')).toBe(expected);
    });

    it('una barbería usa el título del catálogo y muestra la duración de los servicios', async () => {
        const cats = [{ name: 'Cortes', description: null, dishes: [dish({ name: 'Corte clásico', price: 35, kind: 'servicio', durationMin: 30 })] }];
        const out = await build(cats).formatMenuToMarkdown('p1', 'barberia');
        expect(out.startsWith('## 📋 Servicios\n')).toBe(true);
        expect(out).toContain('- **Corte clásico** — S/ 35.00 · 30 min');
        expect(out).not.toContain('Carta Digital');
    });

    it('el título sigue al rubro (comercio: Productos) y un producto no lleva duración', async () => {
        const cats = [{ name: 'Alimento', description: null, dishes: [dish({ name: 'Croquetas 1kg', price: 48.5 })] }];
        const out = await build(cats).formatMenuToMarkdown('p1', 'bodega');
        expect(out.startsWith('## 📋 Productos\n')).toBe(true);
        expect(out).toContain('- **Croquetas 1kg** — S/ 48.50');
        expect(out).not.toContain(' min');
    });

    it('un servicio sin precio igual muestra la duración; sin duración no agrega nada', async () => {
        const cats = [{
            name: 'Baños',
            description: null,
            dishes: [dish({ name: 'Baño medicado', kind: 'servicio', durationMin: 45 }), dish({ name: 'Consulta', kind: 'servicio', price: 60 })],
        }];
        const out = await build(cats).formatMenuToMarkdown('p1', 'veterinaria');
        expect(out).toContain('- **Baño medicado** · 45 min');
        expect(out).toContain('- **Consulta** — S/ 60.00\n');
    });

    it('una categoría vacía de otro rubro no habla de platos', async () => {
        const out = await build([{ name: 'Tintes', description: null, dishes: [] }]).formatMenuToMarkdown('p1', 'peluqueria');
        expect(out).not.toContain('platos');
    });

    it('sin categorías devuelve vacío', async () => {
        expect(await build([]).formatMenuToMarkdown('p1', 'barberia')).toBe('');
    });
});
