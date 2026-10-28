import * as crypto from 'crypto';
import { parseMessageEchoes, parseMetaWebhook, parsePartnerRemoved, parseTemplateAlerts, verifyMetaSignature } from './meta-webhook.util';

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

describe('parseTemplateAlerts', () => {
    const wrap = (field: string, value: any) => ({ entry: [{ id: 'WABA1', changes: [{ field, value }] }] });

    it('avisa rechazo con motivo, aprobación y baja de calidad; ignora lo que no importa', () => {
        const [rejected] = parseTemplateAlerts(wrap('message_template_status_update', { event: 'REJECTED', message_template_name: 'promo_martes', reason: 'INVALID_FORMAT' }));
        expect(rejected).toMatchObject({ wabaId: 'WABA1', templateName: 'promo_martes', title: 'fue rechazada' });
        expect(rejected.detail).toContain('INVALID_FORMAT');

        expect(parseTemplateAlerts(wrap('message_template_status_update', { event: 'APPROVED', message_template_name: 'x' }))[0].title).toBe('fue aprobada');
        expect(parseTemplateAlerts(wrap('message_template_quality_update', { new_quality_score: 'RED', message_template_name: 'x' }))[0].title).toBe('bajó a calidad baja');

        expect(parseTemplateAlerts(wrap('message_template_quality_update', { new_quality_score: 'GREEN', message_template_name: 'x' }))).toEqual([]);
        expect(parseTemplateAlerts(wrap('message_template_status_update', { event: 'PENDING_DELETION', message_template_name: 'x' }))).toEqual([]);
        expect(parseTemplateAlerts(wrap('messages', { messages: [] }))).toEqual([]);
    });
});

describe('parseMessageEchoes', () => {
    const echoes = (message_echoes: any[]) => ({
        entry: [{ id: 'WABA1', changes: [{ field: 'smb_message_echoes', value: { metadata: { phone_number_id: 'PN1' }, message_echoes } }] }],
    });

    it('extrae lo que el negocio envió desde la app, con texto o el tipo si no es texto', () => {
        const out = parseMessageEchoes(echoes([
            { id: 'wamid.e1', from: '51999000111', to: '51987654321', type: 'text', text: { body: 'Te espero a las 4' } },
            { id: 'wamid.e2', from: '51999000111', to: '51987654321', type: 'image' },
        ]));
        expect(out).toEqual([
            { phoneNumberId: 'PN1', to: '51987654321', messageId: 'wamid.e1', body: 'Te espero a las 4' },
            { phoneNumberId: 'PN1', to: '51987654321', messageId: 'wamid.e2', body: '[image]' },
        ]);
    });

    it('ignora otros campos y los mensajes de clientes', () => {
        const payload = { entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'PN1' }, messages: [{ id: 'wamid.1', from: '519', text: { body: 'hola' } }] } }] }] };
        expect(parseMessageEchoes(payload)).toEqual([]);
        expect(parseMetaWebhook(echoes([{ id: 'wamid.e1', to: '519', text: { body: 'x' } }]))).toEqual([]);
    });
});

describe('parsePartnerRemoved', () => {
    it('devuelve la cuenta (WABA) que quitó la conexión desde la app', () => {
        const payload = { entry: [
            { id: 'WABA1', changes: [{ field: 'account_update', value: { phone_number: '51999000111', event: 'PARTNER_REMOVED' } }] },
            { id: 'WABA2', changes: [{ field: 'account_update', value: { event: 'VERIFIED_ACCOUNT' } }] },
        ] };
        expect(parsePartnerRemoved(payload)).toEqual(['WABA1']);
    });
});
