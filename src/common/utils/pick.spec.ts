import { pick } from './pick';

describe('pick', () => {
    it('copia solo los campos permitidos', () => {
        const body = { title: 'Café gratis', placeId: 'otro-local', id: 'x', stampsCost: 5 };
        expect(pick<any, any>(body, ['title', 'stampsCost'])).toEqual({ title: 'Café gratis', stampsCost: 5 });
    });

    it('tolera bodies vacíos o que no son objeto', () => {
        expect(pick<any, any>(null, ['title'])).toEqual({});
        expect(pick<any, any>('texto', ['title'])).toEqual({});
    });
});
