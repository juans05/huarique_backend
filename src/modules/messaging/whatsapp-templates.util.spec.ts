import { buildBodyComponents } from './whatsapp-cloud.service';
import {
    buildCreateTemplatePayload,
    countBodyVariables,
    dedupeRecipients,
    finalStatus,
    renderVariables,
    validateTemplateInput,
} from './whatsapp-templates.util';

describe('plantillas de Meta', () => {
    const base = { name: 'promo_fin_de_semana', language: 'es', category: 'MARKETING' as const, body: 'Hola {{1}}, hoy 2x1 en {{2}}. ¡Te esperamos!', bodyExamples: ['Ana', 'ceviches'] };

    it('cuenta variables por el número más alto', () => {
        expect(countBodyVariables('Sin variables')).toBe(0);
        expect(countBodyVariables('Hola {{1}} y {{2}}')).toBe(2);
    });

    it('valida nombre, ejemplos y variables al borde', () => {
        expect(validateTemplateInput(base)).toBeNull();
        expect(validateTemplateInput({ ...base, name: 'Promo Hoy' })).toMatch(/minúsculas/);
        expect(validateTemplateInput({ ...base, bodyExamples: ['Ana'] })).toMatch(/Faltan ejemplos/);
        expect(validateTemplateInput({ ...base, body: '{{1}} te espera hoy', bodyExamples: ['Ana'] })).toMatch(/empezar/);
        expect(validateTemplateInput({ ...base, category: 'AUTHENTICATION' as any })).toMatch(/categoría/);
    });

    it('arma el payload de creación con los ejemplos y el pie opcional', () => {
        expect(buildCreateTemplatePayload({ ...base, footer: 'Wuarikes' })).toEqual({
            name: 'promo_fin_de_semana',
            language: 'es',
            category: 'MARKETING',
            components: [
                { type: 'BODY', text: base.body, example: { body_text: [['Ana', 'ceviches']] } },
                { type: 'FOOTER', text: 'Wuarikes' },
            ],
        });
        expect(buildCreateTemplatePayload({ ...base, body: 'Gracias por venir', bodyExamples: [] }).components[0]).toEqual({ type: 'BODY', text: 'Gracias por venir' });
    });
});

describe('envío de campañas', () => {
    it('reemplaza {nombre} y nunca deja una variable vacía (Meta la rechaza)', () => {
        expect(renderVariables(['{nombre}', 'ceviches'], { name: ' Ana ' })).toEqual(['Ana', 'ceviches']);
        expect(renderVariables(['{nombre}', ''], { name: null })).toEqual(['Amigo', 'Amigo']);
        expect(renderVariables(null, { name: 'Ana' })).toEqual([]);
    });

    it('arma los parámetros del cuerpo; sin variables no manda componentes', () => {
        expect(buildBodyComponents(['Ana', 'x'])).toEqual([{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: 'x' }] }]);
        expect(buildBodyComponents([])).toEqual([]);
    });

    it('quita teléfonos inválidos y repetidos aunque vengan con distinto formato', () => {
        const out = dedupeRecipients([
            { phone: '+51 987 654 321', name: 'Ana' },
            { phone: '51987654321', name: 'Ana (otra conversación)' },
            { phone: '123' },
            { phone: null },
            { phone: '51900111222', name: 'Luis' },
        ]);
        expect(out.map((r) => r.phone)).toEqual(['51987654321', '51900111222']);
        expect(out[0].name).toBe('Ana');
    });

    it('la campaña termina solo cuando llegaron todos los resultados', () => {
        expect(finalStatus(2, 0, 5)).toBeNull();
        expect(finalStatus(4, 1, 5)).toBe('COMPLETED');
        expect(finalStatus(0, 5, 5)).toBe('FAILED');
        expect(finalStatus(0, 0, 0)).toBeNull();
    });
});
