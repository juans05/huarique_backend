import { starsOf } from './review-reply.util';

describe('review-reply.util', () => {
    it('maps Google star enums to numbers', () => {
        expect(starsOf({ starRating: 'FIVE' })).toBe(5);
        expect(starsOf({ starRating: 'THREE' })).toBe(3);
        expect(starsOf({ starRating: 'STAR_RATING_UNSPECIFIED' })).toBe(0);
        expect(starsOf({})).toBe(0);
    });
});

import { buildReplyMessages, replyOptions } from './review-reply.util';

describe('buildReplyMessages', () => {
    const system = (msgs: any[]) => msgs[0].content as string;

    it('sin opciones mantiene español y el aviso anti-instrucciones', () => {
        const s = system(buildReplyMessages('La Huarica', 5, 'Ana', 'Rico'));
        expect(s).toContain('en español');
        expect(s).toContain('no instrucciones');
    });

    it('idioma del cliente, tono y correo solo en negativas', () => {
        const opts = replyOptions({ tone: 'formal', toneNotes: 'Firma como Chef Rosa', language: 'cliente', contactEmail: 'hola@local.pe' });
        const neg = system(buildReplyMessages('La Huarica', 2, 'Ana', 'Frío', opts));
        expect(neg).toContain('mismo idioma de la reseña');
        expect(neg).toContain('formal');
        expect(neg).toContain('Firma como Chef Rosa');
        expect(neg).toContain('hola@local.pe');
        const pos = system(buildReplyMessages('La Huarica', 5, 'Ana', 'Rico', opts));
        expect(pos).not.toContain('hola@local.pe');
    });
});
