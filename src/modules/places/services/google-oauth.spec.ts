import { GoogleBusinessService } from './google-business.service';

describe('Conexión con Google Business', () => {
    const config = { get: (k: string) => ({ JWT_SECRET: 's', GOOGLE_CLIENT_ID: 'c', DASHBOARD_URL: 'https://panel' } as any)[k] } as any;
    let repo: any;
    let svc: GoogleBusinessService;
    const stateFrom = (url: string) => new URL(url).searchParams.get('state')!;

    beforeEach(() => {
        repo = { findOne: jest.fn(async () => ({ id: 'p1', claimedByUserId: 'dueño' })), update: jest.fn() };
        svc = new GoogleBusinessService(config, repo);
        (global as any).fetch = jest.fn(async () => ({ json: async () => ({ access_token: 'at', refresh_token: 'rt' }) }));
    });

    it('el callback no guarda tokens: reenvía al panel', () => {
        const state = stateFrom(svc.getAuthUrl('p1', 'dueño'));
        expect(svc.callbackRedirect('abc', state)).toContain('https://panel/reputacion?google_code=abc');
        expect(svc.callbackRedirect('abc', 'falso.x')).toContain('error=invalid_state');
        expect(repo.update).not.toHaveBeenCalled();
    });

    it('otro usuario no puede completar el flujo de un dueño', async () => {
        const state = stateFrom(svc.getAuthUrl('p1', 'dueño'));
        expect(await svc.completeConnection('abc', state, 'victima')).toBe('invalid_state');
        expect(repo.update).not.toHaveBeenCalled();
    });

    it('el dueño conecta una sola vez con el mismo state', async () => {
        const state = stateFrom(svc.getAuthUrl('p1', 'dueño'));
        expect(await svc.completeConnection('abc', state, 'dueño')).toBeNull();
        expect(repo.update).toHaveBeenCalledWith('p1', expect.objectContaining({ googleAccessToken: 'at' }));
        expect(await svc.completeConnection('abc', state, 'dueño')).toBe('invalid_state');
    });
});
