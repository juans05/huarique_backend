import { BroadcastProcessor } from './broadcast.processor';

const build = (broadcast: any) => {
    broadcast = broadcast && broadcast.place === undefined ? { ...broadcast, place: { metadata: { whatsappMetaEnabled: true } } } : broadcast;
    const broadcastRepo = { findOne: jest.fn().mockResolvedValue(broadcast), save: jest.fn(async (b: any) => b) };
    const contactRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const whatsapp = { sendWhatsAppMessage: jest.fn().mockResolvedValue(undefined) };
    const credits = { deduct: jest.fn().mockResolvedValue(undefined), deductIfEnough: jest.fn().mockResolvedValue(true), add: jest.fn().mockResolvedValue(undefined) };
    const service = { recordResult: jest.fn().mockResolvedValue(undefined) };
    const cloud = { sendTemplate: jest.fn().mockResolvedValue('wamid.1') };
    const p = new BroadcastProcessor(broadcastRepo as any, contactRepo as any, whatsapp as any, credits as any, service as any, cloud as any);
    return { p, whatsapp, credits, service, cloud, broadcastRepo };
};

const job = { data: { broadcastId: 'b1', customerPhone: '51987654321', customerName: 'Ana', contactId: null } } as any;
const base = { id: 'b1', placeId: 'p1', status: 'SENDING', campaignName: 'Promo', templateBody: 'promo', templateName: 'promo_hoy', templateLanguage: 'es', bodyVariables: ['{nombre}', 'ceviches'], useCsvMerge: false };

describe('BroadcastProcessor', () => {
    it('con el flag y número de Meta → plantilla por la API de WhatsApp Cloud, con variables', async () => {
        const { p, cloud, whatsapp, service, credits } = build({ ...base, whatsappNumber: { provider: 'meta', phoneNumberId: 'PN1' } });
        await p.process(job);
        expect(cloud.sendTemplate).toHaveBeenCalledWith(
            expect.objectContaining({ phoneNumberId: 'PN1' }), '51987654321', 'promo_hoy', 'es',
            [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: 'ceviches' }] }],
        );
        expect(whatsapp.sendWhatsAppMessage).not.toHaveBeenCalled();
        expect(service.recordResult).toHaveBeenCalledWith('b1', true);
        // flujo Meta: cobra con el método que nunca deja el saldo en negativo
        expect(credits.deductIfEnough).toHaveBeenCalledWith('p1', 1, 'broadcast', 'b1', expect.any(String));
        expect(credits.deduct).not.toHaveBeenCalled();
    });

    it('SIN el flag del local, aunque el número sea de Meta y haya plantilla → flujo anterior (texto), sin Meta', async () => {
        const { p, cloud, whatsapp } = build({ ...base, messagesSent: 0, place: { metadata: {} }, whatsappNumber: { provider: 'meta', phoneNumberId: 'PN1', whatsappApiToken: 'T' } });
        await p.process(job);
        expect(cloud.sendTemplate).not.toHaveBeenCalled();
        expect(whatsapp.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    });

    it('número de PlazBot → flujo anterior, sin recordResult (no lleva cierre automático)', async () => {
        const { p, cloud, whatsapp, service } = build({ ...base, messagesSent: 0, whatsappNumber: { provider: 'plazbot', phoneNumberId: 'PN2', whatsappApiToken: null } });
        await p.process(job);
        expect(cloud.sendTemplate).not.toHaveBeenCalled();
        expect(whatsapp.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
        expect(service.recordResult).not.toHaveBeenCalled();
    });

    it('si Meta falla no cuenta como enviado y devuelve el crédito cobrado', async () => {
        const { p, cloud, service, credits } = build({ ...base, whatsappNumber: { provider: 'meta', phoneNumberId: 'PN1' } });
        cloud.sendTemplate.mockRejectedValue(new Error('Template not approved'));
        await expect(p.process(job)).rejects.toThrow('Template not approved');
        expect(service.recordResult).not.toHaveBeenCalled();
        expect(credits.deductIfEnough).toHaveBeenCalledTimes(1);
        expect(credits.add).toHaveBeenCalledWith('p1', 1, 'refund', expect.any(String));
        expect(credits.deduct).not.toHaveBeenCalled();
    });

    it('sin saldo no envía nada y cuenta el mensaje como fallido', async () => {
        const { p, cloud, service, credits } = build({ ...base, whatsappNumber: { provider: 'meta', phoneNumberId: 'PN1' } });
        credits.deductIfEnough.mockResolvedValue(false);
        await p.process(job);
        expect(cloud.sendTemplate).not.toHaveBeenCalled();
        expect(service.recordResult).toHaveBeenCalledWith('b1', false);
    });

    it('flujo anterior: sigue cobrando con deduct, como antes', async () => {
        const { p, credits } = build({ ...base, messagesSent: 0, whatsappNumber: { provider: 'plazbot', phoneNumberId: 'PN2' } });
        await p.process(job);
        expect(credits.deduct).toHaveBeenCalledTimes(1);
        expect(credits.deductIfEnough).not.toHaveBeenCalled();
    });

    it('el fallo solo se cuenta al agotar reintentos y solo en el flujo Meta', async () => {
        const metaB = { id: 'b1', totalRecipients: 5, place: { metadata: { whatsappMetaEnabled: true } }, whatsappNumber: { provider: 'meta' } };
        const { p, service } = build(metaB);
        await p.onFailed({ data: { broadcastId: 'b1' }, attemptsMade: 1, opts: { attempts: 3 } } as any);
        expect(service.recordResult).not.toHaveBeenCalled();
        await p.onFailed({ data: { broadcastId: 'b1' }, attemptsMade: 3, opts: { attempts: 3 } } as any);
        expect(service.recordResult).toHaveBeenCalledWith('b1', false);

        const old = build({ id: 'b2', totalRecipients: 0, place: { metadata: {} }, whatsappNumber: { provider: 'plazbot' } });
        await old.p.onFailed({ data: { broadcastId: 'b2' }, attemptsMade: 3, opts: { attempts: 3 } } as any);
        expect(old.service.recordResult).not.toHaveBeenCalled();
    });

    it('campaña antigua sin plantilla → texto libre (solo llega dentro de 24 h)', async () => {
        const { p, whatsapp, cloud } = build({ ...base, templateName: null, templateBody: 'Hola {nombre}', messagesSent: 0, whatsappNumber: { provider: 'meta', phoneNumberId: 'PN1', whatsappApiToken: 'T' } });
        await p.process(job);
        expect(whatsapp.sendWhatsAppMessage).toHaveBeenCalledWith('PN1', 'T', '51987654321', 'Hola Ana');
        expect(cloud.sendTemplate).not.toHaveBeenCalled();
    });
});
