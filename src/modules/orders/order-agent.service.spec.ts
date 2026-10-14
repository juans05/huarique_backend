import { BadRequestException } from '@nestjs/common';
import { OrderAgentService } from './order-agent.service';

const build = (aiReply: string, existingDraft: any = null) => {
    const drafts: any[] = existingDraft ? [existingDraft] : [];
    const draftsRepo = {
        findOne: jest.fn(async () => drafts.find((d) => d.status === 'ARMANDO') ?? null),
        create: jest.fn((x: any) => ({ items: [], fulfillment: null, deliveryAddress: null, status: 'ARMANDO', ...x })),
        save: jest.fn(async (x: any) => { if (!drafts.includes(x)) drafts.push(x); return x; }),
    };
    const dishesRepo = { find: jest.fn(async () => [{ id: 'd1', name: 'Lomo saltado', price: '35.00', isAvailable: true }]) };
    const ai = { chat: jest.fn(async () => aiReply) };
    const orders = {
        getSettings: jest.fn(async () => ({ ordersEnabled: true, pickupEnabled: true, deliveryEnabled: true, deliveryFee: 500, pricesIncludeIgv: true })),
        createWhatsappOrder: jest.fn(async () => ({ id: 'o1', number: 12, total: 3500, publicToken: 'otok' })),
    };
    const config = { get: () => 'https://admin.wuarikes.com' };
    const svc = new OrderAgentService(draftsRepo as any, dishesRepo as any, ai as any, orders as any, config as any);
    return { svc, drafts, orders, ai };
};

const input = { placeId: 'p1', whatsappNumberId: 'wa1', customerName: 'Luis', customerPhone: '51999', history: [] };

describe('OrderAgentService', () => {
    it('sin intención ni borrador no toma el mensaje', async () => {
        const { svc, ai } = build('{}');
        await expect(svc.handle({ ...input, message: '¿a qué hora abren?' })).resolves.toEqual({ handled: false });
        expect(ai.chat).not.toHaveBeenCalled();
    });

    it('arma el borrador y responde con lo que dice la IA', async () => {
        const { svc, drafts } = build('{"reply":"Anoté 1 lomo saltado. ¿Recojo o delivery?","actions":[{"type":"add_item","dishId":"d1","quantity":1}]}');
        const result = await svc.handle({ ...input, message: 'quiero un lomo saltado' });
        expect(result).toEqual({ handled: true, reply: 'Anoté 1 lomo saltado. ¿Recojo o delivery?' });
        expect(drafts[0].items).toHaveLength(1);
    });

    it('al confirmar crea el pedido y manda el link de pago', async () => {
        const draft = { id: 'dr1', placeId: 'p1', customerPhone: '51999', items: [{ dishId: 'd1', name: 'Lomo saltado', unitPrice: 3500, quantity: 1 }], fulfillment: 'RECOJO', deliveryAddress: null, status: 'ARMANDO', updatedAt: new Date() };
        const { svc, orders, drafts } = build('{"reply":"¡Perfecto!","actions":[{"type":"confirm"}]}', draft);
        const result = await svc.handle({ ...input, message: 'sí, confirmo' });
        expect(orders.createWhatsappOrder).toHaveBeenCalledWith('p1', expect.objectContaining({ fulfillment: 'RECOJO', items: [{ dishId: 'd1', quantity: 1 }] }));
        expect((result as any).reply).toContain('https://admin.wuarikes.com/pagar/otok');
        expect(drafts[0].status).toBe('CONFIRMADO');
    });

    it('si la IA inventa un plato, pregunta en vez de inventar', async () => {
        const { svc, drafts } = build('{"reply":"Anoté pizza","actions":[{"type":"add_item","dishId":"zzz","quantity":1}]}');
        const result = await svc.handle({ ...input, message: 'quiero una pizza' });
        expect((result as any).reply).toContain('No encontré');
        expect(drafts[0].items).toHaveLength(0);
    });

    it('si al confirmar un plato ya no está disponible, avisa y el borrador sigue abierto', async () => {
        const draft = { id: 'dr2', placeId: 'p1', customerPhone: '51999', items: [{ dishId: 'd1', name: 'Lomo saltado', unitPrice: 3500, quantity: 1 }], fulfillment: 'RECOJO', deliveryAddress: null, status: 'ARMANDO', updatedAt: new Date() };
        const { svc, orders } = build('{"reply":"ok","actions":[{"type":"confirm"}]}', draft);
        orders.createWhatsappOrder.mockRejectedValueOnce(new BadRequestException('Este plato ya no está disponible: Lomo saltado'));
        const result = await svc.handle({ ...input, message: 'sí' });
        expect((result as any).reply).toContain('Este plato ya no está disponible: Lomo saltado');
        expect(draft.status).toBe('ARMANDO');
    });

    it('borrador de más de 30 min se descarta y se empieza de nuevo', async () => {
        const old = { id: 'dr0', placeId: 'p1', customerPhone: '51999', items: [{ dishId: 'd1', name: 'x', unitPrice: 1, quantity: 1 }], fulfillment: null, deliveryAddress: null, status: 'ARMANDO', updatedAt: new Date(Date.now() - 31 * 60_000) };
        const { svc, drafts } = build('{"reply":"ok","actions":[]}', old);
        await svc.handle({ ...input, message: 'quiero pedir' });
        expect(old.status).toBe('EXPIRADO');
        expect(drafts.filter((d) => d.status === 'ARMANDO')).toHaveLength(1);
    });
});
