import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn(() => ({ verifyIdToken })) }));

import { AuthService } from './auth.service';

describe('AuthService: arreglos de la auditoría', () => {
    const env: Record<string, any> = { JWT_SECRET: 's', JWT_REFRESH_SECRET: 'r', JWT_EXPIRES_IN: '15m', JWT_REFRESH_EXPIRES_IN: '7d', GOOGLE_LOGIN_CLIENT_ID: 'c' };
    const config = { get: (k: string) => env[k] } as any;
    let user: any;
    let users: any;
    let service: AuthService;

    beforeEach(() => {
        user = { id: 'u1', email: 'a@b.pe', fullName: 'Juan', role: 'business', isVerified: true, isBanned: false, deletedAt: null,
            verificationCode: '123456', verificationCodeExpiresAt: new Date(Date.now() + 60_000) };
        users = {
            findById: jest.fn(async () => user),
            findByEmail: jest.fn(async () => user),
            findBySocialId: jest.fn(async () => null),
            linkSocialAccount: jest.fn(),
            setVerificationCode: jest.fn(),
            updatePassword: jest.fn(),
            markVerified: jest.fn(),
            updateLastLogin: jest.fn(),
        };
        const refreshRepo = { save: async () => undefined, delete: async () => undefined } as any;
        service = new AuthService(users, new JwtService(), config, null as any, refreshRepo);
    });

    it('una cuenta baneada o borrada no obtiene sesión', async () => {
        const { code } = await service.createHandoffCode('u1');
        user.isBanned = true;
        await expect(service.redeemHandoffCode(code)).rejects.toThrow(UnauthorizedException);
        user.isBanned = false;
        user.deletedAt = new Date();
        await expect(service.redeemHandoffCode(code)).rejects.toThrow(UnauthorizedException);
    });

    it('tras 5 códigos incorrectos anula el código aunque luego llegue el correcto', async () => {
        for (let i = 0; i < 5; i++) {
            await expect(service.resetPassword({ email: 'a@b.pe', code: '000000', password: 'NuevaClave1' } as any)).rejects.toThrow('Código inválido');
        }
        expect(users.setVerificationCode).toHaveBeenCalledWith('u1', null, 0);
        expect(users.updatePassword).not.toHaveBeenCalled();
    });

    it('intentos en paralelo no se saltan el tope', async () => {
        const wrong = Array.from({ length: 20 }, () => service.resetPassword({ email: 'a@b.pe', code: '000000', password: 'NuevaClave1' } as any).catch(() => 'x'));
        await Promise.all(wrong);
        // Aunque el usuario se cargó antes de anular el código, el sexto intento ya no compara.
        await expect(service.resetPassword({ email: 'a@b.pe', code: '123456', password: 'NuevaClave1' } as any)).rejects.toThrow('Código inválido');
        expect(users.updatePassword).not.toHaveBeenCalled();
    });

    it('el código correcto cambia la clave', async () => {
        await service.resetPassword({ email: 'a@b.pe', code: '123456', password: 'NuevaClave1' } as any);
        expect(users.updatePassword).toHaveBeenCalled();
    });

    it('Google sin email verificado no enlaza ni entra a la cuenta existente', async () => {
        verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'a@b.pe', email_verified: false, sub: 'g1' }) });
        await expect(service.socialLogin('google', 'tok')).rejects.toThrow(UnauthorizedException);
        expect(users.linkSocialAccount).not.toHaveBeenCalled();
    });

    it('Google con email verificado entra', async () => {
        verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'a@b.pe', email_verified: true, sub: 'g1' }) });
        const res = await service.socialLogin('google', 'tok');
        expect(res.user.id).toBe('u1');
    });
});
