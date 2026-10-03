import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WhatsAppNumbersController } from './whatsapp-numbers.controller';

const build = (number: any, place: any) => {
    const numbers = { findOne: jest.fn().mockResolvedValue(number), delete: jest.fn().mockResolvedValue(undefined) };
    const places = { findOne: jest.fn().mockResolvedValue(place) };
    return { ctrl: new WhatsAppNumbersController(numbers as any, places as any), numbers };
};

describe('WhatsAppNumbersController.deleteWhatsAppNumber', () => {
    const mine = { id: 'p1', claimedByUserId: 'u1' };

    it('el dueño puede desconectar un número de Facebook de su local', async () => {
        const { ctrl, numbers } = build({ id: 'n1', placeId: 'p1', provider: 'meta' }, mine);
        await ctrl.deleteWhatsAppNumber({ id: 'u1' }, 'n1');
        expect(numbers.delete).toHaveBeenCalledWith({ id: 'n1' });
    });

    it('otro usuario NO puede borrar el número de un local ajeno', async () => {
        const { ctrl, numbers } = build({ id: 'n1', placeId: 'p1', provider: 'meta' }, mine);
        await expect(ctrl.deleteWhatsAppNumber({ id: 'intruso' }, 'n1')).rejects.toThrow(ForbiddenException);
        expect(numbers.delete).not.toHaveBeenCalled();
    });

    it('ni el dueño puede borrar un número que no es de Facebook (lo gestiona el admin)', async () => {
        const { ctrl, numbers } = build({ id: 'n2', placeId: 'p1', provider: 'plazbot' }, mine);
        await expect(ctrl.deleteWhatsAppNumber({ id: 'u1' }, 'n2')).rejects.toThrow(ForbiddenException);
        expect(numbers.delete).not.toHaveBeenCalled();
    });

    it('número inexistente → 404', async () => {
        const { ctrl } = build(null, mine);
        await expect(ctrl.deleteWhatsAppNumber({ id: 'u1' }, 'x')).rejects.toThrow(NotFoundException);
    });
});
