import { hasMultimodal, toGeminiRequest } from './gemini-request.util';

const mockGenerate = jest.fn();
jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({ getGenerativeModel: () => ({ generateContent: mockGenerate }) })),
}));
const mockCreate = jest.fn();
jest.mock('openai', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockCreate } } })) }));

import { AiService } from './ai.service';

const cfg = (keys: Record<string, string>) => ({ get: (k: string) => keys[k] }) as any;
const ok = (text: string) => ({ response: { text: () => text } });

describe('toGeminiRequest', () => {
    it('separa el system, renombra assistant→model, fusiona repetidos y empieza con el usuario', () => {
        const r = toGeminiRequest([
            { role: 'system', content: 'Eres un mozo' },
            { role: 'assistant', content: 'Hola, soy el local' }, // abre el local: se descarta
            { role: 'user', content: 'Hola' },
            { role: 'user', content: '¿qué hay?' },
            { role: 'assistant', content: 'Ceviche' },
            { role: 'user', content: '  ' },
        ]);
        expect(r.systemInstruction).toBe('Eres un mozo');
        expect(r.contents).toEqual([
            { role: 'user', parts: [{ text: 'Hola\n¿qué hay?' }] },
            { role: 'model', parts: [{ text: 'Ceviche' }] },
        ]);
    });

    it('detecta imágenes/archivos para mandarlos por OpenRouter', () => {
        expect(hasMultimodal([{ role: 'user', content: 'hola' }])).toBe(false);
        expect(hasMultimodal([{ role: 'user', content: [{ type: 'text', text: 'x' }] }])).toBe(false);
        expect(hasMultimodal([{ role: 'user', content: [{ type: 'text', text: 'x' }, { type: 'image_url', image_url: { url: 'u' } }] }])).toBe(true);
    });
});

describe('AiService.chat', () => {
    beforeEach(() => {
        mockGenerate.mockReset();
        mockCreate.mockReset();
        mockCreate.mockResolvedValue({ choices: [{ message: { content: 'de OpenRouter' } }] });
    });
    const msgs = [{ role: 'user', content: 'hola' }] as any;

    it('texto normal: usa Gemini directo y no toca OpenRouter', async () => {
        mockGenerate.mockResolvedValue(ok('de Gemini'));
        expect(await new AiService(cfg({ GEMINI_API_KEY: 'k' })).chat(msgs)).toBe('de Gemini');
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockGenerate.mock.calls[0][0].generationConfig.maxOutputTokens).toBe(1024);
    });

    it('si Gemini falla (503, vacío) cae a OpenRouter', async () => {
        mockGenerate.mockRejectedValueOnce(new Error('503 high demand'));
        expect(await new AiService(cfg({ GEMINI_API_KEY: 'k' })).chat(msgs)).toBe('de OpenRouter');
        mockGenerate.mockResolvedValueOnce(ok('   '));
        expect(await new AiService(cfg({ GEMINI_API_KEY: 'k' })).chat(msgs)).toBe('de OpenRouter');
    });

    it('sin clave de Gemini, con imágenes o con modelo explícito → OpenRouter directo', async () => {
        expect(await new AiService(cfg({})).chat(msgs)).toBe('de OpenRouter');
        const svc = new AiService(cfg({ GEMINI_API_KEY: 'k' }));
        await svc.chat([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'u' } }] }] as any);
        await svc.chat(msgs, 'google/gemini-2.5-flash', 8192);
        expect(mockGenerate).not.toHaveBeenCalled();
        expect(mockCreate).toHaveBeenCalledTimes(3);
        expect(mockCreate.mock.calls[2][0]).toMatchObject({ model: 'google/gemini-2.5-flash', max_tokens: 8192 });
    });
});
