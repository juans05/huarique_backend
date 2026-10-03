import { MenuAssistantService } from './menu-assistant.service';

const dish = (id: string, isAvailable = true) => ({ id, name: id, isAvailable, price: 10 });

const build = (raw: string) => {
    const ai = { chat: jest.fn().mockResolvedValue(raw) };
    const menu = { getMenu: jest.fn().mockResolvedValue([{ name: 'Platos', dishes: [dish('a'), dish('b'), dish('agotado', false)] }]) };
    const places = { findOne: jest.fn().mockResolvedValue({ id: 'p', name: 'Huarique' }) };
    return { svc: new MenuAssistantService(ai as any, menu as any, places as any), ai };
};

describe('MenuAssistantService', () => {
    it('descarta ids que no están en la carta y respeta el límite de 3', async () => {
        const { svc } = build('```json\n{"reply":"Prueba esto","dishIds":["a","inventado","b","a","b"]}\n```');
        const res = await svc.recommend('p', 'algo rico');
        expect(res.reply).toBe('Prueba esto');
        expect(res.dishIds.every((id) => ['a', 'b'].includes(id))).toBe(true);
    });

    it('no ofrece platos agotados al modelo', async () => {
        const { svc, ai } = build('{"reply":"ok","dishIds":["agotado"]}');
        const res = await svc.recommend('p', 'hola');
        expect(ai.chat.mock.calls[0][0][0].content).not.toContain('id=agotado');
        expect(res.dishIds).toEqual([]);
    });

    it('si el modelo no devuelve JSON, responde con el texto sin platos', async () => {
        const { svc } = build('Te recomiendo el ceviche');
        expect(await svc.recommend('p', 'hola')).toEqual({ reply: 'Te recomiendo el ceviche', dishIds: [] });
    });
});
