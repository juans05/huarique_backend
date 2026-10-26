import { botPromptRequest, hoursLine, type BotPromptFacts } from './bot-prompt.service';

const facts = (over: Partial<BotPromptFacts> = {}): BotPromptFacts => ({
    name: 'El Sultán', typeLabel: 'Barbería', persona: 'asistente de una barbería', customer: 'Cliente', catalog: 'Servicios',
    can: ['reservar, cambiar o cancelar citas'], specialty: 'Barbería clásica', amenities: ['Wifi', 'Aire acondicionado'], tags: [],
    description: null, location: 'Av. Perú 123, Lima', hours: 'Lunes 10:00–20:00', prices: null, phone: null, website: null,
    catalogText: '- **Corte** — S/ 30.00', knowledgeText: 'Aceptamos Yape y Plin.', ...over,
});

describe('hoursLine', () => {
    it('convierte el JSON del horario en una línea; los días cerrados dicen cerrado', () => {
        expect(hoursLine(JSON.stringify([
            { day: 'Lunes', isOpen: true, openTime: '10:00', closeTime: '20:00' },
            { day: 'Domingo', isOpen: false, openTime: '12:00', closeTime: '18:00' },
        ]))).toBe('Lunes 10:00–20:00; Domingo cerrado');
    });

    it('sin horario → null; texto libre de locales antiguos se respeta', () => {
        expect(hoursLine(null)).toBeNull();
        expect(hoursLine('[]')).toBeNull();
        expect(hoursLine('Lun a Sáb 9am-8pm')).toBe('Lun a Sáb 9am-8pm');
    });
});

describe('botPromptRequest', () => {
    it('manda tipo de negocio, especialidad, comodidades, catálogo y Base IA', () => {
        const user = botPromptRequest(facts())[1].content;
        for (const s of ['Tipo de negocio: Barbería', 'Especialidad: Barbería clásica', 'Comodidades: Wifi, Aire acondicionado', 'Corte', 'Yape y Plin', 'reservar, cambiar o cancelar citas'])
            expect(user).toContain(s);
        expect(user).not.toMatch(/platos|restaurante/i);
    });

    it('omite lo que el local no tiene en vez de mandarlo vacío', () => {
        const user = botPromptRequest(facts({ specialty: null, amenities: [], knowledgeText: '', catalogText: '' }))[1].content;
        expect(user).not.toContain('Especialidad:');
        expect(user).not.toContain('Comodidades:');
        expect(user).not.toContain('Base IA del negocio');
    });
});
