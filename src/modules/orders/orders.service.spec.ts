import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';

// Compara una fila con un `where` de TypeORM, incluido `In([...])` (FindOperator con `_value`).
const matches = (row: any, where: any = {}) => Object.entries(where).every(([k, v]: [string, any]) =>
    v && typeof v === 'object' && '_value' in v
        ? (Array.isArray(v._value) ? v._value.includes(row[k]) : row[k] === v._value)
        : row[k] === v);

const memRepo = <T extends { id?: string }>(rows: T[] = []) => ({
    rows,
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
    find: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where))),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => {
        if (!x.id) x.id = `id-${rows.length + 1}`;
        const i = rows.findIndex((r: any) => r.id === x.id);
        if (i >= 0) rows[i] = { ...rows[i], ...x }; else rows.push(x);
        return x;
    }),
    update: jest.fn(async (where: any, patch: any) => {
        const hits = rows.filter((r) => matches(r, where));
        hits.forEach((r) => Object.assign(r, patch));
        return { affected: hits.length };
    }),
});

const build = (opts: { mode?: 'CUENTA_ABIERTA' | 'PREPAGO'; dishAvailable?: boolean } = {}) => {
    const settings = memRepo([{ placeId: 'p1', ordersEnabled: true, tablePaymentMode: opts.mode ?? 'CUENTA_ABIERTA', pricesIncludeIgv: true, deliveryFee: 500, deliveryEnabled: true, pickupEnabled: true } as any]);
    const tables = memRepo([{ id: 't1', placeId: 'p1', name: 'Mesa 4', qrToken: 'qr-1', active: true } as any]);
    const tabs = memRepo<any>([]);
    const orders = memRepo<any>([]);
    const payments = memRepo<any>([]);
    const dishes = memRepo([
        { id: 'd1', placeId: 'p1', name: 'Lomo saltado', price: '35.00', isAvailable: opts.dishAvailable ?? true } as any,
        { id: 'd2', placeId: 'p1', name: 'Chicha', price: '8.50', isAvailable: true } as any,
    ]);
    let counter = 0;
    const dataSource = { query: jest.fn(async () => [{ last_number: ++counter }]) };
    const events = { publish: jest.fn(async () => undefined) };
    const emitter = { emit: jest.fn() };
    const svc = new OrdersService(settings as any, tables as any, tabs as any, orders as any, payments as any, dishes as any, dataSource as any, events as any, emitter as any);
    return { svc, tabs, orders, payments, events, emitter };
};

describe('OrdersService', () => {
    it('cuenta abierta: el pedido nace NUEVO dentro de la cuenta de la mesa y avisa a cocina', async () => {
        const { svc, events } = build();
        const { order, tab, requiresPayment } = await svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 2 }, { dishId: 'd2', quantity: 1 }], customerName: 'Ana' });
        expect(requiresPayment).toBe(false);
        expect(order).toMatchObject({ status: 'NUEVO', channel: 'MESA', fulfillment: 'SALA', subtotal: 7850, total: 7850, number: 1, tabId: tab!.id });
        expect(order.items.map((i: any) => i.dishNameSnapshot)).toEqual(['Lomo saltado', 'Chicha']);
        expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'order.created', placeId: 'p1' }));
    });

    it('segundo pedido de la misma mesa reutiliza la cuenta abierta', async () => {
        const { svc, tabs } = build();
        await svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 1 }] });
        await svc.createTableOrder('qr-1', { items: [{ dishId: 'd2', quantity: 1 }] });
        expect(tabs.rows).toHaveLength(1);
    });

    it('si dos pedidos chocan al abrir la cuenta (23505) se usa la que ganó', async () => {
        const { svc, tabs } = build();
        const winner = { id: 'tab-win', placeId: 'p1', tableId: 't1', status: 'ABIERTA', publicToken: 'x' };
        tabs.save.mockImplementationOnce(async () => { tabs.rows.push(winner); throw Object.assign(new Error('dup'), { code: '23505' }); });
        const { tab } = await svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 1 }] });
        expect(tab!.id).toBe('tab-win');
    });

    it('prepago: el pedido nace PENDIENTE_PAGO, igual activa y se une a la mesa, y no avisa a cocina hasta pagar', async () => {
        const { svc, events, tabs } = build({ mode: 'PREPAGO' });
        const first = await svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 1 }] });
        const second = await svc.createTableOrder('qr-1', { items: [{ dishId: 'd2', quantity: 1 }] });
        expect(first.requiresPayment).toBe(true);
        expect(first.order.status).toBe('PENDIENTE_PAGO');
        expect(tabs.rows).toHaveLength(1);
        expect(first.order.tabId).toBe(tabs.rows[0].id);
        expect(second.order.tabId).toBe(tabs.rows[0].id);
        expect(events.publish).not.toHaveBeenCalled();
    });

    it('total de la mesa: suma pedidos de todos los comensales, sin cancelados ni impagos de prepago', async () => {
        const { svc, orders } = build();
        const a = await svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 1 }], customerName: 'Ana' });
        await svc.createTableOrder('qr-1', { items: [{ dishId: 'd2', quantity: 2 }], customerName: 'Beto' });
        orders.rows.push({ id: 'x', tabId: a.tab!.id, status: 'PENDIENTE_PAGO', total: 9999 });
        orders.rows.push({ id: 'y', tabId: a.tab!.id, status: 'CANCELADO', total: 9999 });
        await expect(svc.tabTotal(a.tab!.id)).resolves.toEqual({ total: 3500 + 1700, paid: 0, due: 5200 });
    });

    it('plato desactivado: 400 con el nombre y no se crea nada', async () => {
        const { svc, orders } = build({ dishAvailable: false });
        await expect(svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 1 }] })).rejects.toThrow('Este plato ya no está disponible: Lomo saltado');
        expect(orders.rows).toHaveLength(0);
    });

    it('QR inexistente o carrito vacío', async () => {
        const { svc } = build();
        await expect(svc.createTableOrder('qr-x', { items: [{ dishId: 'd1', quantity: 1 }] })).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.createTableOrder('qr-1', { items: [] })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('WhatsApp delivery suma la tarifa y nace PENDIENTE_PAGO', async () => {
        const { svc } = build();
        const order = await svc.createWhatsappOrder('p1', { items: [{ dishId: 'd2', quantity: 2 }], customerName: 'Luis', customerPhone: '51999', whatsappNumberId: null, fulfillment: 'DELIVERY', deliveryAddress: 'Av. Arequipa 123' });
        expect(order).toMatchObject({ status: 'PENDIENTE_PAGO', channel: 'WHATSAPP', subtotal: 1700, deliveryFee: 500, total: 2200 });
    });

    it('markOrderPaid solo actúa una vez', async () => {
        const { svc } = build({ mode: 'PREPAGO' });
        const { order } = await svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 1 }] });
        expect(await svc.markOrderPaid(order.id)).toMatchObject({ status: 'NUEVO' });
        expect(await svc.markOrderPaid(order.id)).toBeNull();
    });

    it('changeStatus rechaza saltos inválidos', async () => {
        const { svc, emitter } = build();
        const { order } = await svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 1 }] });
        await expect(svc.changeStatus('p1', order.id, 'ENTREGADO', 'admin')).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.changeStatus('p1', order.id, 'EN_PREPARACION', 'cocina')).resolves.toMatchObject({ status: 'EN_PREPARACION' });
        expect(emitter.emit).toHaveBeenCalledWith('orders.status.changed', { orderId: order.id, status: 'EN_PREPARACION' });
    });

    it('cancelar un pedido con checkout abierto expira sus pagos pendientes', async () => {
        const { svc, payments } = build({ mode: 'PREPAGO' });
        const { order } = await svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 1 }] });
        payments.rows.push({ id: 'pay-1', orderId: order.id, status: 'PENDIENTE' }, { id: 'pay-2', orderId: order.id, status: 'PAGADO' });
        await svc.changeStatus('p1', order.id, 'CANCELADO', 'admin', 'cliente se fue');
        expect(payments.rows.map((p: any) => p.status)).toEqual(['EXPIRADO', 'PAGADO']);
    });

    it('cancelUnpaid también expira los pagos pendientes del pedido', async () => {
        const { svc, payments, orders } = build({ mode: 'PREPAGO' });
        const { order } = await svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 1 }] });
        payments.rows.push({ id: 'pay-1', orderId: order.id, status: 'PENDIENTE' });
        await svc.cancelUnpaid(order.id, 'El código de pago venció');
        expect(orders.rows[0].status).toBe('CANCELADO');
        expect(payments.rows[0].status).toBe('EXPIRADO');
    });

    it('cancelar un pedido de una cuenta con pagos hechos marca devolución pendiente (sobrepago)', async () => {
        const { svc, payments } = build();
        const { order, tab } = await svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 1 }] });
        payments.rows.push({ id: 'pay-1', tabId: tab!.id, orderId: null, status: 'PAGADO', amount: 3500 });
        await expect(svc.changeStatus('p1', order.id, 'CANCELADO', 'admin')).resolves.toMatchObject({ status: 'CANCELADO', refundPending: true });
    });

    it('cancelar sin pagos no marca devolución', async () => {
        const { svc } = build();
        const { order } = await svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 1 }] });
        await expect(svc.changeStatus('p1', order.id, 'CANCELADO', 'admin')).resolves.toMatchObject({ refundPending: false });
    });

    it('mesa con cuenta PAGADA: se cierra y el nuevo pedido abre otra cuenta', async () => {
        const { svc, tabs } = build();
        tabs.rows.push({ id: 'tab-old', placeId: 'p1', tableId: 't1', status: 'PAGADA', publicToken: 'old', closedAt: null });
        // Igual que uq_tabs_live_per_table: una sola cuenta ABIERTA/CUENTA_PEDIDA/PAGADA por mesa.
        const save = tabs.save.getMockImplementation()!;
        tabs.save.mockImplementation(async (x: any) => {
            if (tabs.rows.some((r: any) => r.tableId === x.tableId && ['ABIERTA', 'CUENTA_PEDIDA', 'PAGADA'].includes(r.status))) throw Object.assign(new Error('dup'), { code: '23505' });
            return save(x);
        });
        const { tab } = await svc.createTableOrder('qr-1', { items: [{ dishId: 'd1', quantity: 1 }] });
        expect(tab!.id).not.toBe('tab-old');
        expect(tab!.status).toBe('ABIERTA');
        expect(tabs.rows[0]).toMatchObject({ status: 'CERRADA', closedAt: expect.any(Date) });
    });
});
