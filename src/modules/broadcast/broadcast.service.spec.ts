import { BroadcastService } from './broadcast.service';

const build = (broadcast: any, conversations: any[] = [], cardList: any[] = [], balance = 1000, contacts: any[] = []) => {
    const qb: any = { update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn() };
    const broadcastRepo = {
        findOne: jest.fn().mockResolvedValue(broadcast),
        save: jest.fn(async (b) => b),
        update: jest.fn().mockResolvedValue(undefined),
        find: jest.fn().mockResolvedValue([]),
        query: jest.fn().mockResolvedValue(conversations),
        createQueryBuilder: jest.fn(() => qb),
    };
    const cards = { find: jest.fn().mockResolvedValue(cardList) };
    const credits = { getBalance: jest.fn().mockResolvedValue({ balance }) };
    const contactRepo = { find: jest.fn().mockResolvedValue(contacts) };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const svc = new BroadcastService(broadcastRepo as any, contactRepo as any, {} as any, cards as any, credits as any, queue as any, audit as any);
    return { svc, broadcastRepo, queue, qb };
};

const meta = { provider: 'meta', isActive: true };
const on = { metadata: { whatsappMetaEnabled: true } };

describe('BroadcastService.triggerBroadcast', () => {
    it('en un número de Meta exige plantilla (si no, casi todo fallaría fuera de las 24 h)', async () => {
        const { svc, queue } = build({ id: 'b1', status: 'DRAFT', templateName: null, whatsappNumber: meta, place: on });
        await expect(svc.triggerBroadcast('b1')).rejects.toThrow(/plantilla/);
        expect(queue.add).not.toHaveBeenCalled();
    });

    it('rechaza un número inactivo y una campaña que ya se envió', async () => {
        await expect(build({ id: 'b1', status: 'DRAFT', templateName: 'x', place: on, whatsappNumber: { provider: 'meta', isActive: false } }).svc.triggerBroadcast('b1')).rejects.toThrow(/no está activo/);
        await expect(build({ id: 'b1', status: 'COMPLETED', templateName: 'x', place: on, whatsappNumber: meta }).svc.triggerBroadcast('b1')).rejects.toThrow(/COMPLETED/);
    });

    it('encola un mensaje por persona (sin repetidos), guarda el total y pasa a SENDING', async () => {
        const convs = [
            { customer_phone: '+51 987 654 321', customer_name: 'Ana' },
            { customer_phone: '51987654321', customer_name: 'Ana otra vez' },
            { customer_phone: '51900111222', customer_name: 'Luis' },
        ];
        const { svc, queue, broadcastRepo } = build({ id: 'b1', placeId: 'p1', status: 'DRAFT', templateName: 'promo', whatsappNumber: meta, place: on, csvImportId: null, useCsvMerge: false }, convs);
        const res = await svc.triggerBroadcast('b1');
        expect(res.totalQueued).toBe(2);
        expect(queue.add).toHaveBeenCalledTimes(2);
        expect(broadcastRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'SENDING', totalRecipients: 2, messagesSent: 0, messagesFailed: 0 }));
    });

    it('SIN el flag del local usa el flujo anterior: sin plantilla igual envía, no deduplica ni lleva total', async () => {
        const convs = [{ customer_phone: '51987654321', customer_name: 'Ana' }, { customer_phone: '51987654321', customer_name: 'Ana' }];
        const { svc, queue, broadcastRepo } = build({ id: 'b1', placeId: 'p1', status: 'DRAFT', templateName: null, templateBody: 'Hola', whatsappNumber: { provider: 'plazbot', isActive: false }, place: { metadata: {} }, useCsvMerge: false }, convs);
        const res = await svc.triggerBroadcast('b1');
        expect(res.totalQueued).toBe(2); // igual que antes: no quita repetidos
        expect(queue.add).toHaveBeenCalledTimes(2);
        const saved = broadcastRepo.save.mock.calls[0][0];
        expect(saved.status).toBe('SENDING');
        expect(saved.totalRecipients).toBeUndefined();
    });

    const card = (phone: string, name: string, over: any = {}) => ({ customerPhone: phone, customerName: name, level: 'BRONCE', marketingConsent: true, lastVisitAt: new Date(), createdAt: new Date(), ...over });
    const mk = (segmentFilter: any, extra: any = {}) => ({ id: 'b1', placeId: 'p1', status: 'DRAFT', templateName: 'promo', segmentFilter, whatsappNumber: meta, place: on, useCsvMerge: false, ...extra });

    it('fidelización por nivel: solo los niveles elegidos y solo quienes aceptaron promociones', async () => {
        const cards = [
            card('51900000001', 'Ana', { level: 'ORO' }),
            card('51900000002', 'Beto', { level: 'PLATA' }),
            card('51900000003', 'Carla', { level: 'ORO', marketingConsent: false }),
        ];
        const { svc, queue } = build(mk({ type: 'loyalty', levels: ['ORO'] }), [], cards);
        expect((await svc.triggerBroadcast('b1')).totalQueued).toBe(1);
        expect(queue.add.mock.calls[0][1].customerName).toBe('Ana');
    });

    it('inactivos: tarjetas con consentimiento sin visita hace más de 30 días', async () => {
        const old = new Date(Date.now() - 45 * 86400000);
        const cards = [card('51900000001', 'Vieja', { lastVisitAt: old }), card('51900000002', 'Reciente'), card('51900000003', 'SinConsent', { lastVisitAt: old, marketingConsent: false })];
        const { svc, queue } = build(mk({ type: 'inactive' }), [], cards);
        expect((await svc.triggerBroadcast('b1')).totalQueued).toBe(1);
        expect(queue.add.mock.calls[0][1].customerName).toBe('Vieja');
    });

    it('sin tarjeta (normal): de quienes escribieron, los que no tienen tarjeta', async () => {
        const convs = [{ customer_phone: '51987654321', customer_name: 'Ana' }, { customer_phone: '51955555555', customer_name: 'Beto' }];
        const { svc, queue } = build(mk({ type: 'normal' }), convs, [card('51987654321', 'Ana')]);
        expect((await svc.triggerBroadcast('b1')).totalQueued).toBe(1);
        expect(queue.add.mock.calls[0][1].customerName).toBe('Beto');
    });

    it('lista de Excel elegida: envía solo a los contactos de esa importación', async () => {
        const contacts = [{ id: 'c1', phone: '51911111111', name: 'Excel1' }, { id: 'c2', phone: '51922222222', name: 'Excel2' }];
        const { svc, queue } = build(mk({ type: 'excel' }, { csvImportId: 'imp1' }), [{ customer_phone: '51999999999', customer_name: 'Chat' }], [], 1000, contacts);
        expect((await svc.triggerBroadcast('b1')).totalQueued).toBe(2);
        expect(queue.add.mock.calls.map((c: any) => c[1].customerName)).toEqual(['Excel1', 'Excel2']);
        await expect(build(mk({ type: 'excel' })).svc.triggerBroadcast('b1')).rejects.toThrow(/Excel/);
    });

    it('créditos insuficientes: la campaña no sale y no cambia de estado (nunca queda en negativo)', async () => {
        const convs = [{ customer_phone: '51987654321', customer_name: 'Ana' }, { customer_phone: '51955555555', customer_name: 'Beto' }];
        const { svc, queue, broadcastRepo } = build(mk({ type: 'all' }), convs, [], 1);
        await expect(svc.triggerBroadcast('b1')).rejects.toThrow(/Créditos insuficientes: la campaña llega a 2 personas y tienes 1/);
        expect(queue.add).not.toHaveBeenCalled();
        expect(broadcastRepo.save).not.toHaveBeenCalled();
    });

    it('sin destinatarios la campaña queda FAILED en vez de colgada en SENDING', async () => {
        const { svc, broadcastRepo } = build({ id: 'b1', placeId: 'p1', status: 'DRAFT', templateName: 'promo', whatsappNumber: meta, place: on, useCsvMerge: false }, []);
        await svc.triggerBroadcast('b1');
        expect(broadcastRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED', totalRecipients: 0 }));
    });
});

describe('BroadcastService.recordResult', () => {
    it('suma sin pisar y cierra la campaña cuando llega el último resultado', async () => {
        const { svc, broadcastRepo, qb } = build({ id: 'b1', status: 'SENDING', messagesSent: 4, messagesFailed: 1, totalRecipients: 5 });
        await svc.recordResult('b1', true);
        expect(qb.set).toHaveBeenCalledWith({ messagesSent: expect.any(Function) });
        expect(broadcastRepo.update).toHaveBeenCalledWith({ id: 'b1', status: 'SENDING' }, { status: 'COMPLETED' });
    });

    it('si todos fallaron termina como FAILED; si faltan resultados, no cierra', async () => {
        const a = build({ id: 'b1', status: 'SENDING', messagesSent: 0, messagesFailed: 3, totalRecipients: 3 });
        await a.svc.recordResult('b1', false);
        expect(a.broadcastRepo.update).toHaveBeenCalledWith({ id: 'b1', status: 'SENDING' }, { status: 'FAILED' });

        const b = build({ id: 'b1', status: 'SENDING', messagesSent: 1, messagesFailed: 0, totalRecipients: 3 });
        await b.svc.recordResult('b1', true);
        expect(b.broadcastRepo.update).not.toHaveBeenCalled();
    });
});
