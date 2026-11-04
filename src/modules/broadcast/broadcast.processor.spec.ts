import { BroadcastProcessor } from './broadcast.processor';

const build = (broadcast: any) => {
    broadcast = broadcast && broadcast.place === undefined ? { ...broadcast, place: { metadata: { whatsappMetaEnabled: true } } } : broadcast;
    const broadcastRepo = { findOne: jest.fn().mockResolvedValue(broadcast), save: jest.fn(async (b: any) => b) };
    const contactRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const credits = { deduct: jest.fn().mockResolvedValue(undefined), deductIfEnough: jest.fn().mockResolvedValue(true), add: jest.fn().mockResolvedValue(undefined) };
    const service = { recordResult: jest.fn().mockResolvedValue(undefined) };
    const cloud = { sendTemplate: jest.fn().mockResolvedValue('wamid.1') };
    const p = new BroadcastProcessor(broadcastRepo as any, contactRepo as any, credits as any, service as any, cloud as any);
    return { p, credits, service, cloud, broadcastRepo };
};

const job = { data: { broadcastId: 'b1', customerPhone: '51987654321', customerName: 'Ana', contactId: null } } as any;
const base = { id: 'b1', placeId: 'p1', status: 'SENDING', campaignName: 'Promo', templateBody: 'promo', templateName: 'promo_hoy', templateLanguage: 'es', bodyVariables: ['{nombre}', 'ceviches'], useCsvMerge: false };

describe('BroadcastProcessor', () => {
    it('con el flag y número de Meta → plantilla por la API de WhatsApp Cloud, con variables', async () => {
        const { p, cloud, service, credits } = build({ ...base, whatsappNumber: { provider: 'meta', phoneNumberId: 'PN1' } });
        await p.process(job);
        expect(cloud.sendTemplate).toHaveBeenCalledWith(
            expect.objectContaining({ phoneNumberId: 'PN1' }), '51987654321', 'promo_hoy', 'es',
            [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: 'ceviches' }] }],
        );
        expect(service.recordResult).toHaveBeenCalledWith('b1', true);
        // flujo Meta: cobra con el método que nunca deja el saldo en negativo
        expect(credits.deductIfEnough).toHaveBeenCalledWith('p1', 1, 'broadcast', 'b1', expect.any(String));
        expect(credits.deduct).not.toHaveBeenCalled();
    });

    it('sin Facebook (canal apagado, número no conectado o sin plantilla) no envía ni cobra', async () => {
        for (const extra of [
            { place: { metadata: { whatsappMetaEnabled: false } }, whatsappNumber: { provider: 'meta', phoneNumberId: 'PN1' } },
            { whatsappNumber: { provider: 'plazbot', phoneNumberId: 'PN2' } },
            { templateName: null, whatsappNumber: { provider: 'meta', phoneNumberId: 'PN1' } },
        ]) {
            const { p, cloud, credits } = build({ ...base, ...extra });
            await expect(p.process(job)).rejects.toThrow('Facebook');
            expect(cloud.sendTemplate).not.toHaveBeenCalled();
            expect(credits.deductIfEnough).not.toHaveBeenCalled();
        }
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

    it('el fallo solo se cuenta al agotar reintentos y solo en el flujo Meta', async () => {
        const metaB = { id: 'b1', totalRecipients: 5, place: { metadata: { whatsappMetaEnabled: true } }, whatsappNumber: { provider: 'meta' } };
        const { p, service } = build(metaB);
        await p.onFailed({ data: { broadcastId: 'b1' }, attemptsMade: 1, opts: { attempts: 3 } } as any);
        expect(service.recordResult).not.toHaveBeenCalled();
        await p.onFailed({ data: { broadcastId: 'b1' }, attemptsMade: 3, opts: { attempts: 3 } } as any);
        expect(service.recordResult).toHaveBeenCalledWith('b1', false);

        const old = build({ id: 'b2', totalRecipients: 0, place: { metadata: { whatsappMetaEnabled: false } }, whatsappNumber: { provider: 'meta' } });
        await old.p.onFailed({ data: { broadcastId: 'b2' }, attemptsMade: 3, opts: { attempts: 3 } } as any);
        expect(old.service.recordResult).not.toHaveBeenCalled();
    });
});
