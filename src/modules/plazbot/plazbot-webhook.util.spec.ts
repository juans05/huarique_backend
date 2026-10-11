import { isValidPlazbotSecret } from './plazbot-webhook.util';

describe('isValidPlazbotSecret', () => {
    it('sin secreto configurado acepta todo', () => {
        expect(isValidPlazbotSecret(undefined, '')).toBe(true);
    });

    it('con secreto configurado exige el mismo valor', () => {
        expect(isValidPlazbotSecret('abc123', 'abc123')).toBe(true);
        expect(isValidPlazbotSecret('abc124', 'abc123')).toBe(false);
        expect(isValidPlazbotSecret('abc', 'abc123')).toBe(false);
        expect(isValidPlazbotSecret(undefined, 'abc123')).toBe(false);
    });
});
