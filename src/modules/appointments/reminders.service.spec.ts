import { DEFAULT_OFFSETS, SYSTEM_TEMPLATES, dueOffset, normalizeOffsets, safeAssetName, safeName } from './reminders.service';
import { buildCreateTemplatePayload, validateTemplateInput } from '../messaging/whatsapp-templates.util';

describe('plantillas del sistema', () => {
    it.each(Object.entries(SYSTEM_TEMPLATES))('%s cumple las reglas de Meta', (_key, t) => {
        expect(validateTemplateInput(t)).toBeNull();
        expect(buildCreateTemplatePayload(t)).toEqual(expect.objectContaining({ name: t.name, category: 'UTILITY' }));
    });
});

describe('safeName', () => {
    it('deja solo letras y espacios, sin enlaces ni números', () => {
        expect(safeName('Luis Pérez')).toBe('Luis Pérez');
        expect(safeName('Gana S/500 en bit.ly/x https://estafa.com')).toBe('Gana S en bitlyx');
        expect(safeName('https://estafa.com')).toBe('cliente');
        expect(safeName('123')).toBe('cliente');
        expect(safeName('A'.repeat(80)).length).toBe(40);
    });
});

describe('safeAssetName', () => {
    it('mascota como nombre limpio; placa solo con letras, números y guion', () => {
        expect(safeAssetName('PET', 'Firulais')).toBe('Firulais');
        expect(safeAssetName('PET', 'https://estafa.com')).toBe('tu mascota');
        expect(safeAssetName('VEHICLE', 'abc-123')).toBe('ABC-123');
        expect(safeAssetName('VEHICLE', 'WWW.ESTAFA.COM/PAGA')).toBe('WWWESTAFAC');
        expect(safeAssetName('VEHICLE', '!!')).toBe('tu vehículo');
    });
});

describe('normalizeOffsets', () => {
    it('por defecto un recordatorio 1 día antes', () => {
        expect(DEFAULT_OFFSETS).toEqual([1440]);
        expect(normalizeOffsets(undefined)).toEqual([1440]);
        expect(normalizeOffsets([])).toEqual([1440]);
    });

    it('deja enteros de 30 min a 7 días, sin repetir, de mayor a menor, hasta 3', () => {
        expect(normalizeOffsets([60, 1440, 60, 10, 20000, 1.5, 'x'])).toEqual([1440, 60]);
        expect(normalizeOffsets([60, 120, 1440, 2880])).toEqual([2880, 1440, 120]);
    });
});

describe('dueOffset', () => {
    const start = new Date('2026-10-30T21:00:00Z');
    const created = new Date('2026-10-20T15:00:00Z');
    const at = (hoursBefore: number) => new Date(start.getTime() - hoursBefore * 3600_000);

    it('envía cada tiempo cuando entra en su ventana, una sola vez', () => {
        expect(dueOffset(start, created, [1440, 120], at(30), [])).toBeNull();
        expect(dueOffset(start, created, [1440, 120], at(23), [])).toBe(1440);
        expect(dueOffset(start, created, [1440, 120], at(23), [1440])).toBeNull();
        expect(dueOffset(start, created, [1440, 120], at(1.5), [1440])).toBe(120);
        expect(dueOffset(start, created, [1440, 120], at(-1), [])).toBeNull();
    });

    it('si se atrasó y ya tocan dos, manda solo el más cercano a la cita', () => {
        expect(dueOffset(start, created, [1440, 120], at(1), [])).toBe(120);
    });

    it('no le recuerda a quien reservó después de la hora del recordatorio', () => {
        const late = at(5);
        expect(dueOffset(start, late, [1440], at(4), [])).toBeNull();
        expect(dueOffset(start, late, [1440, 120], at(1), [])).toBe(120);
    });
});
