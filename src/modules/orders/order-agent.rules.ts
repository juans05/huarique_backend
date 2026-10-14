import { DraftItem } from './entities/whatsapp-order-draft.entity';
import { Fulfillment } from './entities/order.entity';

export interface MenuEntry { id: string; name: string; unitPrice: number; description?: string | null }

export type AgentAction =
    | { type: 'add_item'; dishId: string; quantity: number; note?: string }
    | { type: 'remove_item'; dishId: string }
    | { type: 'set_quantity'; dishId: string; quantity: number }
    | { type: 'set_fulfillment'; fulfillment: 'RECOJO' | 'DELIVERY' }
    | { type: 'set_address'; address: string }
    | { type: 'confirm' }
    | { type: 'cancel' };

interface DraftState { items: DraftItem[]; fulfillment: Fulfillment | null; deliveryAddress: string | null }

export function parseAgentReply(raw: string): { reply: string; actions: AgentAction[] } | null {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[0]);
        if (typeof parsed.reply !== 'string') return null;
        return { reply: parsed.reply, actions: Array.isArray(parsed.actions) ? parsed.actions : [] };
    } catch {
        return null;
    }
}

export function applyActions(draft: DraftState, actions: AgentAction[], menu: MenuEntry[]) {
    const items = draft.items.map((i) => ({ ...i }));
    let fulfillment = draft.fulfillment;
    let deliveryAddress = draft.deliveryAddress;
    let confirmRequested = false;
    let canceled = false;
    const rejected: string[] = [];
    const clamp = (n: number) => Math.max(1, Math.min(50, Math.floor(Number(n) || 1)));

    for (const action of actions) {
        if (action.type === 'add_item' || action.type === 'set_quantity') {
            const dish = menu.find((d) => d.id === action.dishId);
            if (!dish) { rejected.push(action.dishId); continue; }
            const existing = items.find((i) => i.dishId === dish.id);
            if (action.type === 'set_quantity') {
                if (existing) existing.quantity = clamp(action.quantity);
                else items.push({ dishId: dish.id, name: dish.name, unitPrice: dish.unitPrice, quantity: clamp(action.quantity) });
            } else if (existing) {
                existing.quantity = clamp(existing.quantity + clamp(action.quantity));
            } else {
                items.push({ dishId: dish.id, name: dish.name, unitPrice: dish.unitPrice, quantity: clamp(action.quantity), ...(action.note ? { note: action.note.slice(0, 200) } : {}) });
            }
        } else if (action.type === 'remove_item') {
            const index = items.findIndex((i) => i.dishId === action.dishId);
            if (index >= 0) items.splice(index, 1);
        } else if (action.type === 'set_fulfillment' && (action.fulfillment === 'RECOJO' || action.fulfillment === 'DELIVERY')) {
            fulfillment = action.fulfillment;
        } else if (action.type === 'set_address' && action.address?.trim()) {
            deliveryAddress = action.address.trim().slice(0, 300);
        } else if (action.type === 'confirm') {
            confirmRequested = true;
        } else if (action.type === 'cancel') {
            canceled = true;
        }
    }

    const ready = items.length > 0 && !!fulfillment && (fulfillment !== 'DELIVERY' || !!deliveryAddress);
    return { draft: { items, fulfillment, deliveryAddress }, confirmed: confirmRequested && ready, canceled, rejected };
}

const INTENT = /\b(quiero|quisiera|me (das|da|manda|mandas|traes)|pedir|pedido|ordenar|para (llevar|recoger)|delivery|deliver|encargar|separar)\b/i;

export function looksLikeOrderIntent(text: string): boolean {
    return INTENT.test(text);
}
