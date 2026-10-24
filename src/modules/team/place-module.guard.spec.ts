import { ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { sign } from 'jsonwebtoken';
import { PlaceModuleGuard } from './place-module.guard';

const SECRET = 'test-secret';
const CONV = '11111111-1111-1111-1111-111111111111';

class ConversationsCtrl { messages() { return null; } }
Reflect.defineMetadata(PATH_METADATA, 'business/conversations', ConversationsCtrl);
Reflect.defineMetadata(PATH_METADATA, ':conversationId/messages', ConversationsCtrl.prototype.messages);

function ctx(req: any) {
    return {
        getType: () => 'http',
        getClass: () => ConversationsCtrl,
        getHandler: () => ConversationsCtrl.prototype.messages,
        switchToHttp: () => ({ getRequest: () => req }),
    } as any;
}

describe('PlaceModuleGuard en rutas por id', () => {
    // Sede A: perfil sin chat. Sede B: sin perfil. La conversación es de la sede A.
    const dataSource = {
        query: jest.fn(async (sql: string, params: any[]) => {
            if (sql.includes('FROM wuarike_db.conversations')) return [{ place_id: 'A' }];
            if (sql.includes('m.place_id = $2')) return params[1] === 'A' ? [{ modules: ['caja'] }] : [];
            return [{ restricted: true, granted: true, owner: false }];
        }),
    };
    const guard = new PlaceModuleGuard(dataSource as any, { get: () => SECRET } as any);
    const auth = { authorization: `Bearer ${sign({ sub: 'u1' }, SECRET)}` };

    it('un ?placeId= de otra sede no reemplaza la sede del recurso', async () => {
        const req = { headers: auth, params: { conversationId: CONV }, query: { placeId: 'B' }, body: {} };
        await expect(guard.canActivate(ctx(req))).rejects.toThrow(ForbiddenException);
    });

    it('sin token deja decidir a JwtAuthGuard', async () => {
        await expect(guard.canActivate(ctx({ headers: {}, params: { conversationId: CONV }, query: {}, body: {} }))).resolves.toBe(true);
    });
});
