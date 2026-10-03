import { SocialAiService, normalizeDmHistory } from './social-ai.service';

const rule: any = { personality: 'friendly', revealPrices: false, customInstructions: 'Menciona el delivery.' };
const place = { id: 'p1', name: 'Ay mi leche' };

describe('normalizeDmHistory', () => {
    it('empieza con el cliente, alterna roles y fusiona mensajes seguidos del mismo autor', () => {
        const out = normalizeDmHistory([
            { role: 'assistant', content: 'Hola, ¿en qué te ayudo?' }, // el local abrió: se descarta
            { role: 'user', content: 'Hola' },
            { role: 'user', content: '¿Atienden hoy?' },
            { role: 'assistant', content: 'Sí, hasta las 10pm' },
            { role: 'user', content: '  ' }, // vacío
        ]);
        expect(out).toEqual([
            { role: 'user', content: 'Hola\n¿Atienden hoy?' },
            { role: 'assistant', content: 'Sí, hasta las 10pm' },
        ]);
    });
});

describe('SocialAiService.generateDmReply', () => {
    it('usa el agente del restaurante (canal instagram) con historial y reglas', async () => {
        const chatProcessor = { processChannelMessage: jest.fn().mockResolvedValue('  Abrimos hasta las 10pm 😊 ') };
        const ai = { chat: jest.fn() };
        const svc = new SocialAiService(ai as any, chatProcessor as any);

        const reply = await svc.generateDmReply(rule, place, '¿hasta qué hora?', [{ role: 'user', content: 'Hola' }]);

        expect(reply).toBe('Abrimos hasta las 10pm 😊');
        const [placeId, channel, msg, history, opts] = chatProcessor.processChannelMessage.mock.calls[0];
        expect([placeId, channel, msg]).toEqual(['p1', 'instagram', '¿hasta qué hora?']);
        expect(history).toEqual([{ role: 'user', content: 'Hola' }]);
        expect(opts.channelRules.join(' ')).toContain('No menciones precios exactos');
        expect(opts.channelRules).toContain('Menciona el delivery.');
        expect(ai.chat).not.toHaveBeenCalled();
    });

    it('si el agente falla, responde con el bot simple en vez de dejar el DM sin contestar', async () => {
        const chatProcessor = { processChannelMessage: jest.fn().mockRejectedValue(new Error('sin proveedor')) };
        const ai = { chat: jest.fn().mockResolvedValue('Hola, te esperamos 🙌') };
        const svc = new SocialAiService(ai as any, chatProcessor as any);

        expect(await svc.generateDmReply(rule, place, 'hola')).toBe('Hola, te esperamos 🙌');
        expect(ai.chat).toHaveBeenCalledTimes(1);
    });
});
