import * as crypto from 'crypto';
import { parseMetaWebhook, verifyMetaSignature } from './meta-webhook.util';

const sign = (body: Buffer, secret: string) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

describe('verifyMetaSignature', () => {
    const body = Buffer.from('{"entry":[]}');

    it('acepta la firma correcta y rechaza cuerpo alterado, firma ajena o ausente', () => {
        expect(verifyMetaSignature(body, sign(body, 's3cret'), 's3cret')).toBe(true);
        expect(verifyMetaSignature(Buffer.from('{"entry":[1]}'), sign(body, 's3cret'), 's3cret')).toBe(false);
        expect(verifyMetaSignature(body, sign(body, 'otro'), 's3cret')).toBe(false);
        expect(verifyMetaSignature(body, undefined, 's3cret')).toBe(false);
        expect(verifyMetaSignature(undefined, sign(body, 's3cret'), 's3cret')).toBe(false);
    });
});

describe('parseMetaWebhook', () => {
    const wrap = (value: any) => ({ entry: [{ changes: [{ value }] }] });
    const metadata = { phone_number_id: 'PN1', display_phone_number: '51999000111' };

    it('extrae texto, nombre del contacto y el id del mensaje', () => {
        const out = parseMetaWebhook(
            wrap({
                metadata,
                contacts: [{ wa_id: '51987654321', profile: { name: 'Ana' } }],
                messages: [{ id: 'wamid.1', from: '51987654321', type: 'text', text: { body: 'Hola, ¿abren hoy?' } }],
            }),
        );
        expect(out).toEqual([
            { phoneNumberId: 'PN1', from: '51987654321', name: 'Ana', messageId: 'wamid.1', body: 'Hola, ¿abren hoy?', type: 'text' },
        ]);
    });

    it('toma el texto de los botones y deja body=null en tipos no soportados (imagen)', () => {
        const out = parseMetaWebhook(
            wrap({
                metadata,
                messages: [
                    { id: 'a', from: '1', type: 'interactive', interactive: { button_reply: { title: 'Ver carta' } } },
                    { id: 'b', from: '1', type: 'image', image: { id: 'x' } },
                ],
            }),
        );
        expect(out.map((m) => m.body)).toEqual(['Ver carta', null]);
    });

    it('ignora estados de entrega y payloads vacíos', () => {
        expect(parseMetaWebhook(wrap({ metadata, statuses: [{ id: 'wamid.1', status: 'delivered' }] }))).toEqual([]);
        expect(parseMetaWebhook(undefined)).toEqual([]);
        expect(parseMetaWebhook({ entry: [{ changes: [{ value: { messages: [{ id: 'x', from: '1' }] } }] }] })).toEqual([]);
    });
});
