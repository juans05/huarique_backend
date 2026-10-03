import { buildMediaPayload, buildTemplatePayload, buildTextPayload, mediaKindFromMime, toCloudPhone } from './whatsapp-cloud.service';
import { WhatsAppSenderService } from './whatsapp-sender.service';

describe('payloads de la API de WhatsApp Cloud', () => {
    it('normaliza el teléfono a solo dígitos', () => {
        expect(toCloudPhone('+51 987-654-321')).toBe('51987654321');
        expect(buildTextPayload('+51 987 654 321', 'Hola')).toMatchObject({ to: '51987654321', type: 'text', text: { body: 'Hola' } });
    });

    it('elige el tipo de media por mime y respeta que el audio no lleva caption', () => {
        expect(mediaKindFromMime('image/png')).toBe('image');
        expect(mediaKindFromMime('application/pdf')).toBe('document');
        expect(buildMediaPayload('51987', 'https://x/carta.pdf', 'application/pdf', 'Nuestra carta')).toEqual({
            to: '51987',
            type: 'document',
            document: { link: 'https://x/carta.pdf', caption: 'Nuestra carta' },
        });
        expect(buildMediaPayload('51987', 'https://x/a.mp3', 'audio/mpeg', 'x').audio).toEqual({ link: 'https://x/a.mp3' });
    });

    it('arma plantillas con idioma', () => {
        expect(buildTemplatePayload('51987', 'promo_hoy', 'es', [])).toEqual({
            to: '51987',
            type: 'template',
            template: { name: 'promo_hoy', language: { code: 'es' }, components: [] },
        });
    });
});

describe('WhatsAppSenderService: proveedor por número', () => {
    const build = (number: any) => {
        const numbers = { findOne: jest.fn().mockResolvedValue(number) };
        const plazbot = { sendMessage: jest.fn().mockResolvedValue(undefined) };
        const cloud = { sendText: jest.fn().mockResolvedValue('wamid.1') };
        return { svc: new WhatsAppSenderService(numbers as any, plazbot as any, cloud as any), plazbot, cloud, numbers };
    };

    it('número "meta" → API de WhatsApp Cloud, sin tocar PlazBot', async () => {
        const { svc, plazbot, cloud } = build({ id: 'n1', provider: 'meta', isActive: true, phoneNumberId: 'PN1' });
        await svc.sendText('n1', '51987', 'Hola');
        expect(cloud.sendText).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }), '51987', 'Hola');
        expect(plazbot.sendMessage).not.toHaveBeenCalled();
    });

    it('número de Facebook desactivado (checkbox apagado) → vuelve a PlazBot, no envía por Meta', async () => {
        const { svc, plazbot, cloud } = build({ id: 'n3', provider: 'meta', isActive: false, phoneNumberId: 'PN3' });
        await svc.sendText('n3', '51987', 'Hola');
        expect(cloud.sendText).not.toHaveBeenCalled();
        expect(plazbot.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('número "plazbot" o sin número asociado → PlazBot (legado)', async () => {
        const a = build({ id: 'n2', provider: 'plazbot' });
        await a.svc.sendText('n2', '51987', 'Hola');
        expect(a.plazbot.sendMessage).toHaveBeenCalledTimes(1);
        expect(a.cloud.sendText).not.toHaveBeenCalled();

        const b = build(null);
        await b.svc.sendText(null, '51987', 'Hola');
        expect(b.numbers.findOne).not.toHaveBeenCalled();
        expect(b.plazbot.sendMessage).toHaveBeenCalledTimes(1);
    });
});
