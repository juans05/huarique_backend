import { ZernioService, normalizeZernioAccounts } from './zernio.service';

describe('normalizeZernioAccounts', () => {
    it('filters out unsupported platforms and normalizes id fields', () => {
        const raw = [
            { platform: 'instagram', username: 'foo', accountId: 'abc123' },
            { platform: 'linkedin', username: 'bar', id: 'ignored' }, // no soportado por Zernio
            { platform: 'facebook', name: 'baz-page', _id: 'def456' }, // fallback name/_id
        ];

        expect(normalizeZernioAccounts(raw)).toEqual([
            { platform: 'instagram', username: 'foo', accountId: 'abc123' },
            { platform: 'facebook', username: 'baz-page', accountId: 'def456' },
        ]);
    });

    it('returns an empty array for null/undefined input', () => {
        expect(normalizeZernioAccounts(undefined as any)).toEqual([]);
    });
});

describe('ZernioService.supportsComments', () => {
    const service = new ZernioService();

    it('allows comments only on instagram and facebook', () => {
        expect(service.supportsComments('instagram')).toBe(true);
        expect(service.supportsComments('facebook')).toBe(true);
        expect(service.supportsComments('tiktok')).toBe(false);
        expect(service.supportsComments('youtube')).toBe(false);
    });
});
