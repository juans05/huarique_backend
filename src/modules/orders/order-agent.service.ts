import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { Dish } from '../places/entities/dish.entity';
import { WhatsappOrderDraft } from './entities/whatsapp-order-draft.entity';
import { OrdersService } from './orders.service';
import { applyActions, looksLikeOrderIntent, MenuEntry, parseAgentReply } from './order-agent.rules';
import { toCents } from './order-rules';

const DRAFT_TTL_MS = 30 * 60_000;
const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2)}`;

@Injectable()
export class OrderAgentService {
    private readonly logger = new Logger(OrderAgentService.name);

    constructor(
        @InjectRepository(WhatsappOrderDraft) private draftsRepo: Repository<WhatsappOrderDraft>,
        @InjectRepository(Dish) private dishesRepo: Repository<Dish>,
        private ai: AiService,
        private orders: OrdersService,
        private config: ConfigService,
    ) { }

    async handle(input: { placeId: string; whatsappNumberId: string | null; customerName: string; customerPhone: string; message: string; history: { role: 'user' | 'assistant'; content: string }[] }): Promise<{ handled: false } | { handled: true; reply: string }> {
        const settings = await this.orders.getSettings(input.placeId);
        if (!settings.ordersEnabled || (!settings.pickupEnabled && !settings.deliveryEnabled)) return { handled: false };

        let draft = await this.draftsRepo.findOne({ where: { placeId: input.placeId, customerPhone: input.customerPhone, status: 'ARMANDO' } });
        if (draft && Date.now() - new Date(draft.updatedAt).getTime() > DRAFT_TTL_MS) {
            draft.status = 'EXPIRADO';
            await this.draftsRepo.save(draft);
            draft = null;
        }
        if (!draft && !looksLikeOrderIntent(input.message)) return { handled: false };
        if (!draft) draft = this.draftsRepo.create({ placeId: input.placeId, customerPhone: input.customerPhone, whatsappNumberId: input.whatsappNumberId, items: [], fulfillment: null, deliveryAddress: null, status: 'ARMANDO' });

        const dishes = await this.dishesRepo.find({ where: { placeId: input.placeId, isAvailable: true } });
        // Solo la carta digital del local: platos disponibles y con precio. Lo que no esté aquí, la IA no puede venderlo.
        const menu: MenuEntry[] = dishes.filter((d) => d.price !== null).map((d) => ({ id: d.id, name: d.name, unitPrice: toCents(d.price as any), description: (d as any).description ?? null }));

        const raw = await this.ai.chat([
            { role: 'system', content: this.systemPrompt(menu, draft, settings) },
            ...input.history.slice(-10),
            { role: 'user', content: input.message },
        ], undefined, 600);
        const parsed = parseAgentReply(raw);
        if (!parsed) {
            this.logger.warn(`Respuesta de IA no parseable: ${raw.slice(0, 200)}`);
            await this.draftsRepo.save(draft);
            return { handled: true, reply: '¿Me repites tu pedido? Dime el plato y la cantidad.' };
        }

        const result = applyActions(draft, parsed.actions, menu);
        Object.assign(draft, result.draft);
        if (result.canceled) {
            draft.status = 'EXPIRADO';
            await this.draftsRepo.save(draft);
            return { handled: true, reply: 'Listo, cancelé tu pedido. Escríbeme cuando quieras pedir de nuevo.' };
        }
        if (result.rejected.length) {
            await this.draftsRepo.save(draft);
            return { handled: true, reply: 'No encontré ese plato en la carta. ¿Me dices el nombre como aparece en la carta?' };
        }
        if (result.confirmed) {
            // Reclamo condicional: dos "sí" seguidos (o un reintento del webhook) no crean dos pedidos.
            if (!draft.id) draft = await this.draftsRepo.save(draft);
            const claimed = await this.draftsRepo.update({ id: draft.id, status: 'ARMANDO' }, { status: 'CONFIRMADO' });
            if (!claimed.affected) return { handled: true, reply: 'Tu pedido ya está registrado. Usa el link de pago que te enviamos.' };
            let order: Awaited<ReturnType<OrdersService['createWhatsappOrder']>>;
            try {
                order = await this.orders.createWhatsappOrder(input.placeId, {
                    items: draft.items.map((i) => ({ dishId: i.dishId, quantity: i.quantity, ...(i.note ? { note: i.note } : {}) })),
                    customerName: input.customerName, customerPhone: input.customerPhone, whatsappNumberId: input.whatsappNumberId,
                    fulfillment: draft.fulfillment as 'RECOJO' | 'DELIVERY', deliveryAddress: draft.deliveryAddress ?? undefined,
                });
            } catch (err) {
                // Plato desactivado entre medio, delivery apagado, etc.: se avisa y el borrador sigue abierto para corregir.
                draft.status = 'ARMANDO';
                await this.draftsRepo.save(draft);
                if (!(err instanceof BadRequestException)) throw err;
                return { handled: true, reply: `${err.message}. ¿Quieres cambiar algo de tu pedido?` };
            }
            draft.status = 'CONFIRMADO';
            draft.orderId = order.id;
            await this.draftsRepo.save(draft);
            const dashboard = this.config.get<string>('DASHBOARD_URL') || 'https://admin.wuarikes.com';
            return { handled: true, reply: `Pedido #${order.number} por ${soles(order.total)}. Paga aquí para enviarlo a cocina: ${dashboard}/pagar/${order.publicToken}` };
        }
        await this.draftsRepo.save(draft);
        return { handled: true, reply: parsed.reply };
    }

    private systemPrompt(menu: MenuEntry[], draft: WhatsappOrderDraft, settings: { pickupEnabled: boolean; deliveryEnabled: boolean; deliveryFee: number }) {
        const carta = menu.map((d) => `- id=${d.id} | ${d.name} | ${soles(d.unitPrice)}${d.description ? ` | ${d.description.slice(0, 120)}` : ''}`).join('\n');
        const current = draft.items.length ? draft.items.map((i) => `${i.quantity} x ${i.name}`).join(', ') : '(vacío)';
        const modes = [settings.pickupEnabled ? 'RECOJO' : null, settings.deliveryEnabled ? `DELIVERY (tarifa ${soles(settings.deliveryFee)})` : null].filter(Boolean).join(' o ');
        return [
            'Eres el asistente de pedidos de un restaurante peruano por WhatsApp. Respondes en español, breve y amable.',
            'Solo puedes usar platos de esta carta (usa exactamente su id):',
            carta,
            `Pedido actual: ${current}. Entrega: ${draft.fulfillment ?? 'sin elegir'}. Dirección: ${draft.deliveryAddress ?? 'sin dirección'}.`,
            `Modos de entrega disponibles: ${modes}.`,
            'Si el cliente pide algo ambiguo (por ejemplo "lomo" y hay dos), pregunta cuál. Si no existe, dilo.',
            'Antes de confirmar, resume ítems, entrega y total, y pregunta "¿Confirmo tu pedido?". Usa la acción confirm solo cuando el cliente diga que sí.',
            'Responde SOLO con JSON: {"reply": "<texto para el cliente>", "actions": [ ... ]}.',
            'Acciones: {"type":"add_item","dishId":"...","quantity":1,"note":"..."} | {"type":"remove_item","dishId":"..."} | {"type":"set_quantity","dishId":"...","quantity":2} | {"type":"set_fulfillment","fulfillment":"RECOJO"|"DELIVERY"} | {"type":"set_address","address":"..."} | {"type":"confirm"} | {"type":"cancel"}.',
        ].join('\n');
    }
}
