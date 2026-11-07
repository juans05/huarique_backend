import { withPublicUser } from './places.service';

describe('withPublicUser', () => {
    it('deja solo id, nombre y foto del autor', () => {
        const item = {
            id: 'p1',
            url: 'https://res.cloudinary.com/x.jpg',
            user: {
                id: 'u1',
                fullName: 'Ana',
                avatarUrl: 'a.png',
                email: 'ana@correo.com',
                phone: '999',
                passwordHash: 'hash',
            },
        };
        expect(withPublicUser(item)).toEqual({
            id: 'p1',
            url: 'https://res.cloudinary.com/x.jpg',
            user: { id: 'u1', fullName: 'Ana', avatarUrl: 'a.png' },
        });
    });

    it('tolera autor nulo', () => {
        expect(withPublicUser({ id: 'p2', user: null })).toEqual({ id: 'p2', user: null });
    });
});
