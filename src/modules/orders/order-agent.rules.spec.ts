import { applyActions, looksLikeOrderIntent, parseAgentReply } from './order-agent.rules';

const menu = [{ id: 'd1', name: 'Lomo saltado', unitPrice: 3500 }, { id: 'd2', name: 'Chicha morada', unitPrice: 850 }];
const empty = { items: [], fulfillment: null, deliveryAddress: null };

describe('order-agent rules', () => {
    it('parsea JSON aunque venga envuelto en ```json', () => {
        const parsed = parseAgentReply('```json\n{"reply":"Listo","actions":[{"type":"add_item","dishId":"d1","quantity":2}]}\n```');
        expect(parsed).toEqual({ reply: 'Listo', actions: [{ type: 'add_item', dishId: 'd1', quantity: 2 }] });
        expect(parseAgentReply('hola, no es json')).toBeNull();
    });

    it('agrega, suma cantidades y fija entrega', () => {
        const r = applyActions(empty, [
            { type: 'add_item', dishId: 'd1', quantity: 1 },
            { type: 'add_item', dishId: 'd1', quantity: 1 },
            { type: 'add_item', dishId: 'd2', quantity: 3 },
            { type: 'set_fulfillment', fulfillment: 'RECOJO' },
        ], menu);
        expect(r.draft.items).toEqual([
            { dishId: 'd1', name: 'Lomo saltado', unitPrice: 3500, quantity: 2 },
            { dishId: 'd2', name: 'Chicha morada', unitPrice: 850, quantity: 3 },
        ]);
        expect(r.draft.fulfillment).toBe('RECOJO');
    });

    it('descarta platos inventados y no cambia el borrador', () => {
        const r = applyActions(empty, [{ type: 'add_item', dishId: 'no-existe', quantity: 1 }], menu);
        expect(r.draft.items).toEqual([]);
        expect(r.rejected).toEqual(['no-existe']);
    });

    it('confirm solo vale con ítems, entrega y dirección si es delivery', () => {
        expect(applyActions(empty, [{ type: 'confirm' }], menu).confirmed).toBe(false);
        const withItems = applyActions(empty, [{ type: 'add_item', dishId: 'd1', quantity: 1 }, { type: 'set_fulfillment', fulfillment: 'DELIVERY' }, { type: 'confirm' }], menu);
        expect(withItems.confirmed).toBe(false);
        const ok = applyActions(withItems.draft, [{ type: 'set_address', address: 'Av. Arequipa 123' }, { type: 'confirm' }], menu);
        expect(ok.confirmed).toBe(true);
    });

    it('detecta intención de pedir', () => {
        expect(looksLikeOrderIntent('quiero 2 lomos para llevar')).toBe(true);
        expect(looksLikeOrderIntent('Me das una chicha?')).toBe(true);
        expect(looksLikeOrderIntent('¿a qué hora abren?')).toBe(false);
    });
});
