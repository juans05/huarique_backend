import { SYSTEM_TEMPLATES, safeAssetName, safeName } from './reminders.service';
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
