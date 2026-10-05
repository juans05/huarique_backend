import { sanitizeMenuTheme } from './menu-theme.util';

describe('sanitizeMenuTheme', () => {
    it('acepta colores hex válidos (en mayúsculas) y descarta los inválidos', () => {
        expect(sanitizeMenuTheme({ headerBg: '#ff8800', bodyBg: 'red', footerBg: '#12345', accent: '#abcdef' })).toEqual({
            headerBg: '#FF8800',
            accent: '#ABCDEF',
        });
    });

    it('limpia los textos: sin saltos ni caracteres de control, con tope de largo, vacíos fuera', () => {
        const out = sanitizeMenuTheme({ tagline: '  Cevichería\n\n criolla\u0000  ', menuTitle: '   ', footerText: 'x'.repeat(500), notice: 123 });
        expect(out.tagline).toBe('Cevichería criolla');
        expect(out.menuTitle).toBeUndefined();
        expect(out.footerText).toHaveLength(240);
        expect(out.notice).toBeUndefined();
    });

    it('ignora claves desconocidas (no se puede guardar basura ni scripts como campo) y entradas inválidas', () => {
        expect(sanitizeMenuTheme({ evil: '<script>', headerBg: '#000000' })).toEqual({ headerBg: '#000000' });
        expect(sanitizeMenuTheme(null)).toEqual({});
        expect(sanitizeMenuTheme('texto')).toEqual({});
    });
});
