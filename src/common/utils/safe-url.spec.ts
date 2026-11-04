import { assertPublicUrl, isPrivateAddress } from './safe-url';

describe('safe-url', () => {
    it('detecta direcciones internas', () => {
        for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
            expect(isPrivateAddress(ip)).toBe(true);
        }
        for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
            expect(isPrivateAddress(ip)).toBe(false);
        }
    });

    it('rechaza esquemas y destinos internos sin hacer peticiones', async () => {
        for (const u of ['http://127.0.0.1:3001/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'file:///etc/passwd', 'ftp://example.com', 'http://localhost/', 'http://api.railway.internal/', 'no-es-url']) {
            await expect(assertPublicUrl(u)).rejects.toThrow();
        }
    });

    it('acepta una IP pública', async () => {
        await expect(assertPublicUrl('https://8.8.8.8/')).resolves.toBeInstanceOf(URL);
    });
});
