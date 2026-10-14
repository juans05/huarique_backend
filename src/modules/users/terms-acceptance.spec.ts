import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CURRENT_TERMS_VERSION } from './terms-acceptance';

const build = () => {
    const user: any = { id: 'u1', termsVersionAccepted: null, termsAcceptedAt: null };
    const usersRepository = {
        findOne: jest.fn(async () => user),
        update: jest.fn(async (_where: any, patch: any) => Object.assign(user, patch)),
    };
    const svc = new UsersService(usersRepository as any, {} as any, {} as any);
    return { svc, user, usersRepository };
};

describe('aceptación de Términos', () => {
    it('registra versión, fecha e IP de la versión vigente', async () => {
        const { svc, user } = build();
        const result = await svc.acceptTerms('u1', CURRENT_TERMS_VERSION, '200.48.1.10');
        expect(user).toMatchObject({ termsVersionAccepted: CURRENT_TERMS_VERSION, termsAcceptedIp: '200.48.1.10' });
        expect(user.termsAcceptedAt).toBeInstanceOf(Date);
        expect(result).toMatchObject({ currentVersion: CURRENT_TERMS_VERSION, acceptedVersion: CURRENT_TERMS_VERSION });
    });

    it('rechaza aceptar una versión que no es la vigente', async () => {
        const { svc, usersRepository } = build();
        await expect(svc.acceptTerms('u1', '2020-01-01', null)).rejects.toBeInstanceOf(BadRequestException);
        expect(usersRepository.update).not.toHaveBeenCalled();
    });
});
