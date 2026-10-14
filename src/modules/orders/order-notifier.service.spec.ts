import { OrderNotifierService } from './order-notifier.service';

const build = (order: any) => {
    const ordersRepo = { find: jest.fn(async () => [order]), findOne: jest.fn(async () => order), update: jest.fn() };
    const waRepo = { findOne: jest.fn(async () => ({ id: 'wa-local' })) };
    const settings = { getSettings: jest.fn(async () => ({ prepTimeMin: 20 })) };
    const loyalty = { scan: jest.fn(async () => ({})) };
    const sender = { sendText: jest.fn(async () => undefined) };
    const queue = { add: jest.fn(async () => undefined) };
    const svc = new OrderNotifierService(ordersRepo as any, waRepo as any, settings as any, loyalty as any, sender as any, queue as any);
    return { svc, loyalty, sender, queue };
};

describe('OrderNotifierService', () => {
    it('pago confirmado: suma fidelización y avisa por WhatsApp', async () => {
        const order = { id: 'o1', placeId: 'p1', number: 12, channel: 'WHATSAPP', fulfillment: 'RECOJO', customerPhone: '51999', customerName: 'Luis', whatsappNumberId: 'wa1', publicToken: 't' };
        const { svc, loyalty, sender } = build(order);
        await svc.onPaymentConfirmed({ paymentId: 'pay1', placeId: 'p1', orderIds: ['o1'] });
        expect(loyalty.scan).toHaveBeenCalledWith('p1', '51999', 'Luis');
        expect(sender.sendText).toHaveBeenCalledWith('wa1', '51999', expect.stringContaining('#12'));
    });

    it('sin programa de fidelización no rompe el aviso', async () => {
        const order = { id: 'o1', placeId: 'p1', number: 3, channel: 'WHATSAPP', fulfillment: 'RECOJO', customerPhone: '51999', whatsappNumberId: 'wa1', publicToken: 't' };
        const { svc, loyalty, sender } = build(order);
        loyalty.scan.mockRejectedValueOnce(new Error('sin programa'));
        await svc.onPaymentConfirmed({ paymentId: 'pay1', placeId: 'p1', orderIds: ['o1'] });
        expect(sender.sendText).toHaveBeenCalled();
    });

    it('entregado en sala: encola la reseña a los 45 min', async () => {
        const order = { id: 'o2', placeId: 'p1', number: 4, channel: 'MESA', fulfillment: 'SALA', customerPhone: '51988', whatsappNumberId: null, publicToken: 't' };
        const { svc, queue } = build(order);
        await svc.onStatusChanged({ orderId: 'o2', status: 'ENTREGADO' });
        expect(queue.add).toHaveBeenCalledWith('review', { orderId: 'o2' }, expect.objectContaining({ delay: 45 * 60_000, jobId: 'review-o2' }));
    });

    it('sin teléfono no hace nada', async () => {
        const order = { id: 'o3', placeId: 'p1', number: 5, channel: 'MESA', fulfillment: 'SALA', customerPhone: null, publicToken: 't' };
        const { svc, queue, loyalty } = build(order);
        await svc.onPaymentConfirmed({ paymentId: 'x', placeId: 'p1', orderIds: ['o3'] });
        await svc.onStatusChanged({ orderId: 'o3', status: 'ENTREGADO' });
        expect(loyalty.scan).not.toHaveBeenCalled();
        expect(queue.add).not.toHaveBeenCalled();
    });
});
