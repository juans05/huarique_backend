import { PushService } from './push.service';

const msg = { title: 'Nueva reserva', body: 'Luis reservó Corte', data: { appointmentId: 'a1', placeId: 'pl1', kind: 'nueva' as const } };

const make = (devices: { token: string }[]) => {
    const repo = { find: jest.fn().mockResolvedValue(devices), delete: jest.fn().mockResolvedValue({}) };
    return { service: new PushService(repo as any), repo };
};

const expoReply = (data: any[]) => ({ ok: true, json: async () => ({ data }) }) as any;

describe('PushService.sendToUsers', () => {
    let fetchSpy: jest.SpyInstance;
    beforeEach(() => { fetchSpy = jest.spyOn(global, 'fetch'); });
    afterEach(() => fetchSpy.mockRestore());

    it('sin dispositivos no llama a fetch', async () => {
        const { service } = make([]);
        await service.sendToUsers(['u1'], msg);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sin usuarios no consulta ni envía', async () => {
        const { service, repo } = make([{ token: 'ExponentPushToken[a]' }]);
        await service.sendToUsers([], msg);
        expect(repo.find).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('manda un mensaje por token con canal citas y los datos', async () => {
        const { service } = make([{ token: 'ExponentPushToken[a]' }, { token: 'ExponentPushToken[b]' }]);
        fetchSpy.mockResolvedValue(expoReply([{ status: 'ok' }, { status: 'ok' }]));
        await service.sendToUsers(['u1', 'u1', 'u2'], msg);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://exp.host/--/api/v2/push/send');
        const body = JSON.parse(init.body);
        expect(body).toHaveLength(2);
        expect(body[0]).toMatchObject({ to: 'ExponentPushToken[a]', title: 'Nueva reserva', channelId: 'citas', sound: 'default', priority: 'high', data: msg.data });
    });

    it('si Expo responde DeviceNotRegistered borra ese token', async () => {
        const { service, repo } = make([{ token: 'ExponentPushToken[a]' }, { token: 'ExponentPushToken[b]' }]);
        fetchSpy.mockResolvedValue(expoReply([{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }]));
        await service.sendToUsers(['u1'], msg);
        expect(repo.delete).toHaveBeenCalledWith({ token: expect.objectContaining({ _value: ['ExponentPushToken[b]'] }) });
    });

    it('si fetch lanza, sendToUsers no lanza', async () => {
        const { service } = make([{ token: 'ExponentPushToken[a]' }]);
        fetchSpy.mockRejectedValue(new Error('sin red'));
        await expect(service.sendToUsers(['u1'], msg)).resolves.toBeUndefined();
    });
});
