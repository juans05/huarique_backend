import axios from 'axios';
import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { MetaConnectService } from './meta-connect.service';

jest.mock('axios');
const request = axios.request as jest.Mock;

const dto = { placeId: 'p1', code: 'CODE', wabaId: 'WABA1', phoneNumberId: 'PN1' };

const build = (over: { place?: any; existing?: any } = {}) => {
    const numbers = {
        findOne: jest.fn().mockResolvedValue(over.existing ?? null),
        create: jest.fn((v) => v),
        save: jest.fn(async (v) => ({ id: 'num1', ...v })),
        update: jest.fn().mockResolvedValue(undefined),
    };
    const places = {
        findOne: jest.fn().mockResolvedValue('place' in over ? over.place : { id: 'p1', claimedByUserId: 'u1', metadata: { whatsappMetaEnabled: true } }),
        save: jest.fn(async (v) => v),
    };
    return { svc: new MetaConnectService(numbers as any, places as any), numbers, places };
};

describe('MetaConnectService', () => {
    beforeEach(() => {
        process.env.META_APP_ID = 'APP';
        process.env.META_APP_SECRET = 'SECRET';
        request.mockReset();
    });

    it('config() indica si falta configuración en el servidor', () => {
        delete process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;
        expect(build().svc.config().configured).toBe(false);
        process.env.META_EMBEDDED_SIGNUP_CONFIG_ID = 'CFG';
        expect(build().svc.config()).toMatchObject({ configured: true, appId: 'APP', configId: 'CFG' });
    });

    it('canjea el código, suscribe la app y guarda el número como proveedor "meta"', async () => {
        request
            .mockResolvedValueOnce({ data: { access_token: 'TOKEN' } }) // oauth
            .mockResolvedValueOnce({ data: { success: true } }) // subscribed_apps
            .mockResolvedValueOnce({ data: { success: true } }) // register
            .mockResolvedValueOnce({ data: { display_phone_number: '+51 947 196 047', verified_name: 'Ay mi leche' } }); // info
        const { svc, numbers } = build();

        const res = await svc.complete('u1', dto);

        expect(res).toEqual({ id: 'num1', phoneNumber: '51947196047', verifiedName: 'Ay mi leche' });
        const urls = request.mock.calls.map((c) => c[0].url as string);
        expect(urls[0]).toContain('/oauth/access_token');
        expect(urls[1]).toContain('/WABA1/subscribed_apps');
        expect(urls[2]).toContain('/PN1/register');
        expect(request.mock.calls[1][0].headers.Authorization).toBe('Bearer TOKEN');
        expect(numbers.save).toHaveBeenCalledWith(
            expect.objectContaining({ placeId: 'p1', phoneNumberId: 'PN1', wabaId: 'WABA1', whatsappApiToken: 'TOKEN', provider: 'meta', isActive: true }),
        );
    });

    it('si el registro del número falla (ya estaba registrado) igual guarda el número', async () => {
        request
            .mockResolvedValueOnce({ data: { access_token: 'TOKEN' } })
            .mockResolvedValueOnce({ data: {} })
            .mockRejectedValueOnce({ response: { data: { error: { message: 'already registered' } } } })
            .mockResolvedValueOnce({ data: { display_phone_number: '51900000000' } });
        const res = await build().svc.complete('u1', dto);
        expect(res.phoneNumber).toBe('51900000000');
    });

    it('rechaza a quien no es dueño del local y los números de otro local, sin llamar a Meta', async () => {
        await expect(build({ place: { id: 'p1', claimedByUserId: 'otro' } }).svc.complete('u1', dto)).rejects.toThrow(ForbiddenException);
        await expect(build({ existing: { id: 'x', placeId: 'otro-local' } }).svc.complete('u1', dto)).rejects.toThrow(ConflictException);
        expect(request).not.toHaveBeenCalled();
    });

    it('no conecta nada si el local no activó el checkbox de Facebook (sigue PlazBot)', async () => {
        const off = build({ place: { id: 'p1', claimedByUserId: 'u1', metadata: {} } });
        await expect(off.svc.complete('u1', dto)).rejects.toThrow(BadRequestException);
        expect(request).not.toHaveBeenCalled();
        expect(await off.svc.getChannel('u1', 'p1')).toEqual({ metaEnabled: false });
    });

    it('desactivar el checkbox deja inactivos los números de Facebook sin tocar los de PlazBot', async () => {
        const { svc, numbers, places } = build({ place: { id: 'p1', claimedByUserId: 'u1', metadata: { walletColor: '#fff', whatsappMetaEnabled: true } } });
        await svc.setChannel('u1', 'p1', false);
        expect(numbers.update).toHaveBeenCalledWith({ placeId: 'p1', provider: 'meta' }, { isActive: false });
        expect(places.save).toHaveBeenCalledWith(expect.objectContaining({ metadata: { walletColor: '#fff', whatsappMetaEnabled: false } }));
        await svc.setChannel('u1', 'p1', true);
        expect(numbers.update).toHaveBeenLastCalledWith({ placeId: 'p1', provider: 'meta' }, { isActive: true });
    });

    it('solo el dueño puede cambiar el canal', async () => {
        await expect(build({ place: { id: 'p1', claimedByUserId: 'otro', metadata: {} } }).svc.setChannel('u1', 'p1', true)).rejects.toThrow(ForbiddenException);
    });

    it('sin META_APP_SECRET responde que no está configurado', async () => {
        delete process.env.META_APP_SECRET;
        await expect(build().svc.complete('u1', dto)).rejects.toThrow(ServiceUnavailableException);
    });
});
