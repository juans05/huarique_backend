import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { NowFriend } from '../now/entities/now-friend.entity';

describe('UsersService.unfollow', () => {
    const existing = { followerId: 'f1', followingId: 'a1' };
    const m = { remove: jest.fn(), delete: jest.fn() };
    const follows: any = {
        findOne: jest.fn(),
        manager: { transaction: jest.fn(async (cb: (x: typeof m) => unknown) => cb(m)) },
    };
    const svc = new UsersService({} as any, {} as any, follows);

    beforeEach(() => jest.clearAllMocks());

    it('al dejar de seguir, el seguidor sale de la lista de Amigos del autor', async () => {
        follows.findOne.mockResolvedValue(existing);
        await svc.unfollow('f1', 'a1');
        expect(m.remove).toHaveBeenCalledWith(existing);
        expect(m.delete).toHaveBeenCalledWith(NowFriend, { ownerId: 'a1', friendId: 'f1' });
    });

    it('si no lo seguía, 404 y no toca la lista', async () => {
        follows.findOne.mockResolvedValue(null);
        await expect(svc.unfollow('f1', 'a1')).rejects.toBeInstanceOf(NotFoundException);
        expect(m.delete).not.toHaveBeenCalled();
    });
});
