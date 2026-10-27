import { BadRequestException } from '@nestjs/common';
import { PushController } from './push.controller';

// La baja va sin sesión (la app la reintenta tras cerrar sesión sin internet): solo acepta tokens de Expo.
describe('PushController.unregister', () => {
    const make = () => {
        const push = { unregister: jest.fn().mockResolvedValue(undefined) };
        return { ctrl: new PushController(push as any), push };
    };

    it('borra el celular por su token', async () => {
        const { ctrl, push } = make();
        await ctrl.unregister('ExponentPushToken[abc123]');
        expect(push.unregister).toHaveBeenCalledWith('ExponentPushToken[abc123]');
    });

    it('un texto que no es token de Expo → 400 y no borra nada', async () => {
        const { ctrl, push } = make();
        await expect(ctrl.unregister('%')).rejects.toThrow(BadRequestException);
        expect(push.unregister).not.toHaveBeenCalled();
    });
});
