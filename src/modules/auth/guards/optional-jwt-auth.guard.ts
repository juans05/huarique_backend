import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Si hay token válido pone `request.user`; si no hay o es inválido deja pasar con `null` (nunca 401). */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
    handleRequest<T>(_err: unknown, user: T | false): T | null {
        return user || null;
    }
}
