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

describe('WhatsAppSenderService: solo Facebook', () => {
    const build = (number: any, flag = true) => {
        const numbers = { findOne: jest.fn().mockResolvedValue(number) };
        const places = { findOne: jest.fn().mockResolvedValue({ id: 'p1', metadata: flag ? {} : { whatsappMetaEnabled: false } }) };
        const cloud = { sendText: jest.fn().mockResolvedValue('wamid.1') };
        return { svc: new WhatsAppSenderService(numbers as any, places as any, cloud as any), cloud };
    };

    it('número de Facebook activo → API de WhatsApp Cloud', async () => {
        const { svc, cloud } = build({ id: 'n1', provider: 'meta', isActive: true, phoneNumberId: 'PN1' });
        await svc.sendText('n1', '51987', 'Hola');
        expect(cloud.sendText).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }), '51987', 'Hola', 'bot');
    });

    it('canal apagado, número inactivo, número antiguo de PlazBot o sin número → no envía', async () => {
        for (const [number, flag] of [
            [{ id: 'n4', provider: 'meta', isActive: true, placeId: 'p1' }, false],
            [{ id: 'n3', provider: 'meta', isActive: false }, true],
            [{ id: 'n2', provider: 'plazbot', isActive: true }, true],
            [null, true],
        ] as const) {
            const { svc, cloud } = build(number, flag);
            await expect(svc.sendText(number ? number.id : null, '51987', 'Hola')).rejects.toThrow('Facebook');
            expect(cloud.sendText).not.toHaveBeenCalled();
        }
    });
});
