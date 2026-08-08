import { Controller, Get, Param, Query, Res, Logger } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import { Place } from '../places/entities/place.entity';
import { SocialAccount } from './entities/social-account.entity';
import { ZernioService } from './zernio.service';

// Sin JwtAuthGuard a propósito: Zernio redirige el navegador aquí directamente
// tras el OAuth, sin Authorization header (mismo patrón que GoogleCallbackController).
@ApiExcludeController()
@Controller('business/places/:placeId/social')
export class SocialCallbackController {
    private readonly logger = new Logger(SocialCallbackController.name);

    constructor(
        private zernio: ZernioService,
        @InjectRepository(Place)
        private placesRepo: Repository<Place>,
        @InjectRepository(SocialAccount)
        private accountsRepo: Repository<SocialAccount>,
    ) {}

    @Get('zernio-callback')
    async zernioCallback(
        @Param('placeId') placeId: string,
        @Query('state') state: string,
        @Res() res: Response,
    ) {
        // El popup de OAuth necesita mantener window.opener para poder cerrarse/avisar a la
        // ventana principal — helmet pone COOP: same-origin por defecto, lo relajamos solo aquí.
        res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');

        const frontendUrl = process.env.FRONTEND_URL || 'https://warique-dashboard.vercel.app';
        const place = await this.placesRepo.findOneBy({ id: placeId });
        const profileId = place?.metadata?.zernioProfileId;
        if (!place || !profileId) {
            return res.redirect(`${frontendUrl}/social?error=no_profile`);
        }

        // Anti-CSRF: exige el state de un solo uso emitido por getConnectUrl, no vencido.
        const expectedState = place.metadata?.zernioOauthState;
        const stateExpiresAt = place.metadata?.zernioOauthStateExpiresAt;
        if (!state || !expectedState || state !== expectedState || !stateExpiresAt || Date.now() > stateExpiresAt) {
            this.logger.warn(`Zernio callback con state inválido/expirado para place ${placeId}`);
            return res.redirect(`${frontendUrl}/social?error=invalid_state`);
        }
        // Consumir el state (un solo uso) antes de hacer cualquier otra cosa.
        delete place.metadata.zernioOauthState;
        delete place.metadata.zernioOauthStateExpiresAt;
        await this.placesRepo.save(place);

        try {
            const accounts = await this.zernio.getActivePlatforms(profileId);
            for (const acc of accounts) {
                if (!acc.accountId) continue;
                const existing = await this.accountsRepo.findOne({
                    where: { placeId, platform: acc.platform as any, platformUserId: acc.accountId },
                });
                if (existing) {
                    if (!existing.isActive) {
                        existing.isActive = true;
                        await this.accountsRepo.save(existing);
                    }
                    continue;
                }
                await this.accountsRepo.save(
                    this.accountsRepo.create({
                        placeId,
                        platform: acc.platform as any,
                        provider: 'zernio',
                        platformUserId: acc.accountId,
                        platformUsername: acc.username,
                        isActive: true,
                    }),
                );
            }
        } catch (err) {
            this.logger.error(`Error sincronizando cuentas Zernio para place ${placeId}: ${err.message}`);
            return res.redirect(`${frontendUrl}/social?error=sync_failed`);
        }

        return res.redirect(`${frontendUrl}/social?connected=1`);
    }
}
