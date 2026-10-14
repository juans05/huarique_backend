import { Controller, ForbiddenException, Param, Query, Sse, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable, from, switchMap } from 'rxjs';
import { PlaceTeamService } from '../team/place-team.service';
import { OrderEventsService, StreamMessage } from './order-events.service';

// EventSource no manda headers: el JWT va por query, igual que el stream de conversaciones.
@Controller('business/places/:placeId/orders')
export class OrdersStreamController {
    constructor(private jwt: JwtService, private team: PlaceTeamService, private events: OrderEventsService) { }

    @Sse('stream')
    stream(@Param('placeId') placeId: string, @Query('token') token: string): Observable<StreamMessage> {
        let userId: string;
        try {
            userId = this.jwt.verify(token).sub;
        } catch {
            throw new UnauthorizedException('Sesión inválida o vencida');
        }
        return from(this.team.getMembership(userId, placeId)).pipe(
            switchMap((member) => {
                if (!member) throw new ForbiddenException('No tenés acceso a esta sede');
                return this.events.streamForPlace(placeId);
            }),
        );
    }
}
