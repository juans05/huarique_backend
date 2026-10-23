import { SYSTEM_TEMPLATES } from './reminders.service';
import { buildCreateTemplatePayload, validateTemplateInput } from '../messaging/whatsapp-templates.util';

describe('plantillas del sistema', () => {
    it.each(Object.entries(SYSTEM_TEMPLATES))('%s cumple las reglas de Meta', (_key, t) => {
        expect(validateTemplateInput(t)).toBeNull();
        expect(buildCreateTemplatePayload(t)).toEqual(expect.objectContaining({ name: t.name, category: 'UTILITY' }));
    });
});
