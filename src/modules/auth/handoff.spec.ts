import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('Traspaso de sesión app → web', () => {
    const env: Record<string, any> = { JWT_SECRET: 's', JWT_REFRESH_SECRET: 'r', JWT_EXPIRES_IN: '15m', JWT_REFRESH_EXPIRES_IN: '7d' };
    const config = { get: (k: string) => env[k] } as any;
    const jwt = new JwtService();
    const user = { id: 'u1', email: 'a@b.pe', fullName: 'Juan', role: 'business' };
    const users = { findById: async (id: string) => (id === 'u1' ? user : Promise.reject(new Error('no'))) } as any;
    const refreshRepo = { save: async () => undefined, delete: async () => undefined } as any;
    const service = new AuthService(users, jwt, config, null as any, refreshRepo);

    it('canjea el código por una sesión del mismo usuario', async () => {
        const { code } = await service.createHandoffCode('u1');
        const session = await service.redeemHandoffCode(code);
        expect(session.user.id).toBe('u1');
        expect(jwt.verify(session.accessToken, { secret: 's' }).sub).toBe('u1');
    });

    it('el código no sirve como access token, ni un access token como código', async () => {
        const { code } = await service.createHandoffCode('u1');
        expect(() => jwt.verify(code, { secret: 's' })).toThrow();
        const access = await jwt.signAsync({ sub: 'u1' }, { secret: 's' });
        await expect(service.redeemHandoffCode(access)).rejects.toThrow('venció');
    });

    it('rechaza un código vencido o basura', async () => {
        const expired = await jwt.signAsync({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 1 }, { secret: 's:handoff' });
        await expect(service.redeemHandoffCode(expired)).rejects.toThrow('venció');
        await expect(service.redeemHandoffCode('basura')).rejects.toThrow('venció');
    });
});
