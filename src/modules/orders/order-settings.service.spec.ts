import { BadRequestException } from '@nestjs/common';
import { OrderSettingsService } from './order-settings.service';

const repo = (rows: any[] = []) => ({
    rows,
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null),
    find: jest.fn(async ({ where }: any) => rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v))),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => { const i = rows.findIndex((r) => (r.placeId && r.placeId === x.placeId && !r.qrToken) || (r.id && r.id === x.id)); if (i >= 0) rows[i] = { ...rows[i], ...x }; else rows.push({ id: `id-${rows.length + 1}`, ...x }); return rows[i >= 0 ? i : rows.length - 1]; }),
});

const config = { get: (k: string) => (k === 'DASHBOARD_URL' ? 'https://admin.wuarikes.com' : k === 'API_PUBLIC_URL' ? 'https://api.wuarikes.com' : undefined) } as any;

describe('OrderSettingsService', () => {
    it('nunca devuelve la secret y muestra los últimos 4 de la pública', async () => {
        const settings = repo([{ placeId: 'p1', culqiPublicKey: 'pk_live_abcd1234', culqiSecretKey: 'sk_live_secret', paymentDestination: 'LOCAL' }]);
        const svc = new OrderSettingsService(settings as any, repo() as any, config);
        const view = await svc.getForAdmin('p1');
        expect(view).not.toHaveProperty('culqiSecretKey');
        expect(view).toMatchObject({ culqiConfigured: true, culqiPublicKeyLast4: '1234', webhookUrl: 'https://api.wuarikes.com/api/public/payments/culqi-webhook?place=p1' });
    });

    it('sin llaves se guarda igual y avisa; con llaves queda configurado; el modo WUARIKES está bloqueado', async () => {
        const svc = new OrderSettingsService(repo() as any, repo() as any, config);
        await expect(svc.update('p1', { deliveryFee: 500 })).resolves.toMatchObject({ culqiConfigured: false, paymentDestination: 'LOCAL' });
        await expect(svc.update('p1', { culqiPublicKey: 'pk_test_1', culqiSecretKey: 'sk_test_1' })).resolves.toMatchObject({ culqiConfigured: true });
        await expect(svc.update('p1', { paymentDestination: 'WUARIKES' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('secret vacía no borra la guardada', async () => {
        const settings = repo([{ placeId: 'p1', culqiPublicKey: 'pk_test_1', culqiSecretKey: 'sk_test_1' }]);
        const svc = new OrderSettingsService(settings as any, repo() as any, config);
        await svc.update('p1', { culqiSecretKey: '', deliveryFee: 700 });
        expect(settings.rows[0]).toMatchObject({ culqiSecretKey: 'sk_test_1', deliveryFee: 700 });
    });

    it('crear mesa genera QR con URL de la carta', async () => {
        const tables = repo();
        const svc = new OrderSettingsService(repo() as any, tables as any, config);
        const table = await svc.createTable('p1', { name: 'Mesa 1', capacity: 4 });
        expect(table.qrToken).toMatch(/^[0-9a-f]{32}$/);
        expect(svc.tableQrUrl(table)).toBe(`https://admin.wuarikes.com/menu/p1?mesa=${table.qrToken}`);
    });
});
