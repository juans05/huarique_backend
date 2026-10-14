import { isOptOutMessage, revokeMarketingConsent } from './marketing-opt-out.util';

describe('marketing opt-out', () => {
    it('reconoce los pedidos de baja', () => {
        for (const text of ['BAJA', 'baja', ' Baja. ', 'STOP', 'darme de baja', 'no quiero más promociones', 'no mas mensajes']) {
            expect(isOptOutMessage(text)).toBe(true);
        }
    });

    it('no confunde mensajes normales con una baja', () => {
        for (const text of ['quiero 2 lomos', '¿la carta baja de precio?', 'bajaron los precios?', 'hola', '']) {
            expect(isOptOutMessage(text)).toBe(false);
        }
    });

    it('retira el consentimiento en las tres tablas usando los últimos 9 dígitos', async () => {
        const manager = { query: jest.fn(async () => []) };
        await revokeMarketingConsent(manager as any, 'p1', '+51 987 654 321');
        expect(manager.query).toHaveBeenCalledTimes(3);
        expect(manager.query.mock.calls.map((c: any[]) => c[0].match(/UPDATE wuarike_db\.(\w+)/)[1])).toEqual(['loyalty_cards', 'contacts', 'public_feedback']);
        manager.query.mock.calls.forEach((c: any[]) => expect(c[1]).toEqual(['p1', '987654321']));
    });

    it('un número incompleto no toca nada', async () => {
        const manager = { query: jest.fn() };
        await revokeMarketingConsent(manager as any, 'p1', '123');
        expect(manager.query).not.toHaveBeenCalled();
    });
});
