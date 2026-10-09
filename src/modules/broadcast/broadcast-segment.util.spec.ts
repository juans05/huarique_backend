import { inactiveDays, segmentRecipients } from './broadcast-segment.util';

const day = 86400000;
const card = (phone: string, over: any = {}) => ({ customerPhone: phone, customerName: phone, level: 'BRONCE', marketingConsent: true, lastVisitAt: new Date(), createdAt: new Date(), ...over });
const now = new Date('2026-10-04T12:00:00Z');

describe('segmentRecipients', () => {
    it('all / excel devuelven la lista base tal cual', () => {
        const base = [{ phone: '1' }];
        expect(segmentRecipients({ type: 'all' }, base, [])).toBe(base);
        expect(segmentRecipients({ type: 'excel' }, base, [])).toBe(base);
        expect(segmentRecipients(undefined, base, [])).toBe(base);
    });

    it('loyalty sin niveles = todos los niveles; ignora niveles inventados; exige consentimiento', () => {
        const cards = [card('a', { level: 'ORO' }), card('b', { level: 'VIP' }), card('c', { level: 'PLATA', marketingConsent: false }), card('d', { marketingConsent: null })];
        expect(segmentRecipients({ type: 'loyalty' }, [], cards).map((r) => r.phone)).toEqual(['a', 'b']);
        expect(segmentRecipients({ type: 'loyalty', levels: ['VIP', 'XX'] }, [], cards).map((r) => r.phone)).toEqual(['b']);
    });

    it('inactive: usa lastVisitAt (o la creación si nunca visitó) y los días configurados', () => {
        const cards = [
            card('viejo', { lastVisitAt: new Date(now.getTime() - 31 * day) }),
            card('justo', { lastVisitAt: new Date(now.getTime() - 29 * day) }),
            card('nunca-viejo', { lastVisitAt: null, createdAt: new Date(now.getTime() - 60 * day) }),
            card('nunca-nuevo', { lastVisitAt: null, createdAt: new Date(now.getTime() - 5 * day) }),
            card('sin-consent', { lastVisitAt: new Date(now.getTime() - 90 * day), marketingConsent: false }),
        ];
        expect(segmentRecipients({ type: 'inactive' }, [], cards, now).map((r) => r.phone)).toEqual(['viejo', 'nunca-viejo']);
        expect(segmentRecipients({ type: 'inactive', days: 7 }, [], cards, now).map((r) => r.phone)).toEqual(['viejo', 'justo', 'nunca-viejo']);
    });

    it('normal: quita de la base a quien tiene tarjeta, aunque no haya aceptado promociones', () => {
        const out = segmentRecipients({ type: 'normal' }, [{ phone: '+51 900 000 001' }, { phone: '51900000002' }], [card('51900000001', { marketingConsent: false })]);
        expect(out.map((r) => r.phone)).toEqual(['51900000002']);
    });

    it('días fuera de rango se corrigen y un segmento desconocido falla', () => {
        expect(inactiveDays({ days: 0 })).toBe(30);
        expect(inactiveDays({ days: 9999 })).toBe(365);
        expect(inactiveDays(undefined)).toBe(30);
        expect(() => segmentRecipients({ type: 'otro' }, [], [])).toThrow(/no soportado/);
    });
});
