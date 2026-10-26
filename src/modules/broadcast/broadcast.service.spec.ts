import { BroadcastService } from './broadcast.service';

const build = (broadcast: any, conversations: any[] = [], cardList: any[] = [], balance = 1000, contacts: any[] = [], place: any = { businessType: 'barberia' }) => {
    const qb: any = { update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn() };
    const broadcastRepo = {
        findOne: jest.fn().mockResolvedValue(broadcast),
        save: jest.fn(async (b) => b),
        create: jest.fn((b) => b),
        update: jest.fn().mockResolvedValue(undefined),
        find: jest.fn().mockResolvedValue([]),
        query: jest.fn().mockResolvedValue(conversations),
        createQueryBuilder: jest.fn(() => qb),
        manager: { getRepository: () => ({ findOne: jest.fn().mockResolvedValue(place) }) },
    };
    const cards = { find: jest.fn().mockResolvedValue(cardList) };
    const credits = { getBalance: jest.fn().mockResolvedValue({ balance }), deductIfEnough: jest.fn().mockResolvedValue(true), add: jest.fn() };
    const contactRepo = { find: jest.fn().mockResolvedValue(contacts) };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const numbers = { findOne: jest.fn().mockResolvedValue({ id: 'n1', placeId: 'p1' }) };
    const cloud = { sendTemplate: jest.fn().mockResolvedValue({}) };
    const svc = new BroadcastService(broadcastRepo as any, contactRepo as any, numbers as any, cards as any, credits as any, queue as any, audit as any, cloud as any);
    return { svc, broadcastRepo, queue, qb, credits, cloud };
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
        const { svc, queue, broadcastRepo } = build({ id: 'b1', placeId: 'p1', status: 'DRAFT', templateName: null, templateBody: 'Hola', whatsappNumber: { provider: 'plazbot', isActive: false }, place: { metadata: { whatsappMetaEnabled: false } }, useCsvMerge: false }, convs);
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

describe('Campaña de recordatorio de cita', () => {
    const base = { placeId: 'p1', whatsappNumberId: 'n1', campaignName: 'Recordatorio', templateBody: 'Hola {{1}}', templateName: 'recordatorio', kind: 'reminder' };

    it('solo para belleza, con un tiempo entre 15 min y 7 días y con plantilla; nace pausada', async () => {
        await expect(build(null, [], [], 1000, [], { businessType: 'restaurante' }).svc.createBroadcast({ ...base, reminderOffsetMin: 60 })).rejects.toThrow(/barberías/);
        await expect(build(null).svc.createBroadcast({ ...base, reminderOffsetMin: 10 })).rejects.toThrow(/15 minutos/);
        await expect(build(null).svc.createBroadcast({ ...base, reminderOffsetMin: 8 * 1440 })).rejects.toThrow(/7 días/);
        await expect(build(null).svc.createBroadcast({ ...base, reminderOffsetMin: 60, templateName: '' })).rejects.toThrow(/plantilla/);
        const saved = await build(null).svc.createBroadcast({ ...base, reminderOffsetMin: 60, scheduledAt: '2099-01-01' });
        expect(saved).toMatchObject({ kind: 'reminder', reminderOffsetMin: 60, status: 'DRAFT', scheduledAt: null });
    });

    it('"Enviar" en un recordatorio lo activa (SCHEDULED) sin encolar mensajes', async () => {
        const { svc, queue, broadcastRepo } = build({ id: 'b1', ...base, reminderOffsetMin: 60, status: 'DRAFT', whatsappNumber: meta, place: on });
        const res = await svc.triggerBroadcast('b1');
        expect(res.status).toBe('SCHEDULED');
        expect(queue.add).not.toHaveBeenCalled();
        expect(broadcastRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'SCHEDULED' }));
    });

    it('envía a las citas que entran en la ventana: reclama, cobra, manda la plantilla con los datos de la cita y cuenta', async () => {
        const b = { id: 'b1', ...base, reminderOffsetMin: 60, status: 'SCHEDULED', templateLanguage: 'es', bodyVariables: ['{nombre}', '{servicio} a las {hora}'], whatsappNumber: meta, place: { ...on, name: 'El Sultán' } };
        const { svc, broadcastRepo, cloud, credits } = build(b);
        broadcastRepo.find.mockResolvedValue([b]);
        const appt = { id: 'a1', customer_name: 'Luis 999', customer_phone: '51987654321', service_name: 'Corte', starts_at: '2026-10-26T21:00:00Z', public_token: 't', pro: 'Juan' };
        broadcastRepo.query.mockImplementation(async (sql: string) => (sql.includes('FROM wuarike_db.appointments') ? [appt] : sql.startsWith('INSERT') ? [{ appointment_id: 'a1' }] : []));
        await svc.processReminderCampaigns();
        const due = broadcastRepo.query.mock.calls.find((c: any[]) => c[0].includes('FROM wuarike_db.appointments'));
        expect(due[1]).toEqual(['p1', 60, 'b1']);
        expect(due[0]).toContain("'\\D'"); // la regex llega a Postgres como \D, no como D
        expect(credits.deductIfEnough).toHaveBeenCalledWith('p1', 1, 'broadcast', 'b1', expect.any(String));
        expect(cloud.sendTemplate.mock.calls[0][1]).toBe('51987654321');
        expect(cloud.sendTemplate.mock.calls[0][2]).toBe('recordatorio');
        const params = cloud.sendTemplate.mock.calls[0][4][0].parameters.map((x: any) => x.text);
        expect(params).toEqual(['Luis', 'Corte a las 4:00 pm']);
        expect(broadcastRepo.query.mock.calls.some((c: any[]) => c[0].includes('messages_sent = messages_sent + 1'))).toBe(true);
    });

    it('si otra instancia ya reclamó la cita no envía; si Meta falla devuelve el crédito y cuenta el fallo', async () => {
        const b = { id: 'b1', ...base, reminderOffsetMin: 60, status: 'SCHEDULED', bodyVariables: [], whatsappNumber: meta, place: { ...on, name: 'X' } };
        const appt = { id: 'a1', customer_name: 'Ana', customer_phone: '51900111222', service_name: 'Corte', starts_at: '2026-10-26T21:00:00Z', public_token: 't', pro: null };
        const taken = build(b);
        taken.broadcastRepo.find.mockResolvedValue([b]);
        taken.broadcastRepo.query.mockImplementation(async (sql: string) => (sql.includes('FROM wuarike_db.appointments') ? [appt] : []));
        await taken.svc.processReminderCampaigns();
        expect(taken.cloud.sendTemplate).not.toHaveBeenCalled();

        const failing = build(b);
        failing.broadcastRepo.find.mockResolvedValue([b]);
        failing.broadcastRepo.query.mockImplementation(async (sql: string) => (sql.includes('FROM wuarike_db.appointments') ? [appt] : sql.startsWith('INSERT') ? [{ appointment_id: 'a1' }] : []));
        failing.cloud.sendTemplate.mockRejectedValue(new Error('131042'));
        await failing.svc.processReminderCampaigns();
        expect(failing.credits.add).toHaveBeenCalledWith('p1', 1, 'refund', expect.any(String));
        expect(failing.broadcastRepo.query.mock.calls.some((c: any[]) => c[0].includes('messages_failed = messages_failed + 1'))).toBe(true);
    });
});

describe('BroadcastService.updateBroadcast', () => {
    it('edita una campaña en borrador (nombre, plantilla, variables); programarla a futuro la deja SCHEDULED', async () => {
        const { svc } = build({ id: 'b1', placeId: 'p1', kind: 'mass', status: 'DRAFT', campaignName: 'Vieja', templateName: 'a', whatsappNumberId: 'n1' });
        const saved = await svc.updateBroadcast('b1', { campaignName: 'Nueva', templateName: 'b', bodyVariables: ['{nombre}'], scheduledAt: '2099-01-01T10:00:00Z' });
        expect(saved).toMatchObject({ campaignName: 'Nueva', templateName: 'b', bodyVariables: ['{nombre}'], status: 'SCHEDULED' });
    });

    it('no edita una campaña masiva que ya salió', async () => {
        await expect(build({ id: 'b1', kind: 'mass', status: 'COMPLETED' }).svc.updateBroadcast('b1', { campaignName: 'x' })).rejects.toThrow(/ya se envió/);
    });

    it('un recordatorio activo se puede editar (cambia el tiempo) pero se valida igual', async () => {
        const reminder = { id: 'b1', placeId: 'p1', kind: 'reminder', status: 'SCHEDULED', templateName: 'r', reminderOffsetMin: 60, whatsappNumberId: 'n1' };
        expect(await build({ ...reminder }).svc.updateBroadcast('b1', { reminderOffsetMin: 120 })).toMatchObject({ reminderOffsetMin: 120, status: 'SCHEDULED' });
        await expect(build({ ...reminder }).svc.updateBroadcast('b1', { reminderOffsetMin: 5 })).rejects.toThrow(/15 minutos/);
    });
});
