import { hasMultimodal, toGeminiRequest } from './gemini-request.util';

const mockGenerate = jest.fn();
const mockGetModel = jest.fn();
jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: (...args: any[]) => { mockGetModel(...args); return { generateContent: mockGenerate }; },
    })),
}));
const mockClaude = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ messages: { create: mockClaude } })) }));
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
        mockGetModel.mockReset();
        mockClaude.mockReset();
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

    it('si Gemini falla (503, vacío) en todos sus modelos cae a OpenRouter', async () => {
        mockGenerate.mockRejectedValue(new Error('503 high demand'));
        expect(await new AiService(cfg({ GEMINI_API_KEY: 'k' })).chat(msgs)).toBe('de OpenRouter');
        mockGenerate.mockResolvedValue(ok('   '));
        expect(await new AiService(cfg({ GEMINI_API_KEY: 'k' })).chat(msgs)).toBe('de OpenRouter');
    });

    it('prueba los modelos de Gemini en orden; a los Flash-Lite no les manda thinkingBudget', async () => {
        mockGenerate.mockRejectedValueOnce(new Error('503')).mockResolvedValueOnce(ok('del segundo'));
        expect(await new AiService(cfg({ GEMINI_API_KEY: 'k' })).chat(msgs)).toBe('del segundo');
        expect(mockGetModel.mock.calls.map((c) => c[0].model)).toEqual(['gemini-3.1-flash-lite', 'gemini-flash-latest']);
        expect(mockGenerate.mock.calls[0][0].generationConfig.thinkingConfig).toBeUndefined();
        expect(mockGenerate.mock.calls[1][0].generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    });

    it('si Gemini falla usa Claude (otra empresa) antes que OpenRouter, con system aparte y roles alternados', async () => {
        mockGenerate.mockRejectedValue(new Error('503'));
        mockClaude.mockResolvedValue({ content: [{ type: 'text', text: 'de Claude' }] });
        const chat = [{ role: 'system', content: 'Eres el bot' }, { role: 'user', content: 'hola' }, { role: 'assistant', content: 'hola!' }, { role: 'user', content: 'precio?' }] as any;
        expect(await new AiService(cfg({ GEMINI_API_KEY: 'k', ANTHROPIC_API_KEY: 'a' })).chat(chat)).toBe('de Claude');
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockClaude.mock.calls[0][0]).toMatchObject({
            system: 'Eres el bot',
            messages: [{ role: 'user', content: 'hola' }, { role: 'assistant', content: 'hola!' }, { role: 'user', content: 'precio?' }],
        });
    });

    it('si fallan todos los proveedores responde 503 con un mensaje claro, no un 500', async () => {
        mockGenerate.mockRejectedValue(new Error('503'));
        mockClaude.mockRejectedValue(new Error('529 overloaded'));
        mockCreate.mockRejectedValue(new Error('401 User not found.'));
        await expect(new AiService(cfg({ GEMINI_API_KEY: 'k', ANTHROPIC_API_KEY: 'a' })).chat(msgs)).rejects.toMatchObject({ status: 503 });
    });

    it('sin clave de Gemini, con imágenes o con modelo explícito → OpenRouter directo', async () => {
        expect(await new AiService(cfg({})).chat(msgs)).toBe('de OpenRouter');
        const svc = new AiService(cfg({ GEMINI_API_KEY: 'k' }));
        await svc.chat([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'u' } }] }] as any);
        await svc.chat(msgs, 'google/gemini-2.5-flash', 8192);
        expect(mockGenerate).not.toHaveBeenCalled();
        expect(mockClaude).not.toHaveBeenCalled();
        expect(mockCreate).toHaveBeenCalledTimes(3);
        expect(mockCreate.mock.calls[2][0]).toMatchObject({ model: 'google/gemini-2.5-flash', max_tokens: 8192 });
    });
});
