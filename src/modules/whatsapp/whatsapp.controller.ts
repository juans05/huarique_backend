import { Controller, Get, Post, Body, Query, Req, Res, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { WhatsappService } from './whatsapp.service';
import { ConfigService } from '@nestjs/config';
import { verifyMetaSignature } from './meta-webhook.util';

@Controller('business/webhooks')
export class WhatsappController {
    private readonly logger = new Logger(WhatsappController.name);

    constructor(
        private readonly whatsappService: WhatsappService,
        private readonly configService: ConfigService
    ) {}

    // Meta Webhook Verification (GET)
    @Get('whatsapp')
    verifyWebhook(
        @Query('hub.mode') mode: string,
        @Query('hub.verify_token') token: string,
        @Query('hub.challenge') challenge: string
    ) {
        const secretToken = this.configService.get<string>('WHATSAPP_WEBHOOK_TOKEN');
        if (!secretToken) {
            return 'Forbidden';
        }
        if (mode === 'subscribe' && token === secretToken) {
            return challenge;
        }
        return 'Forbidden';
    }

    // Receive incoming chats from Meta (POST)
    @Post('whatsapp')
    async handleIncomingMessage(@Req() req: Request, @Res() res: Response, @Body() payload: any) {
        // Fail-closed: sin App Secret no hay forma de comprobar que el mensaje viene de Meta.
        const appSecret = this.configService.get<string>('META_APP_SECRET');
        if (!appSecret) {
            this.logger.error('[whatsapp-webhook] META_APP_SECRET no configurado — se rechaza el request');
            return res.status(500).json({ status: 'server misconfigured' });
        }
        const signature = req.headers['x-hub-signature-256'] as string | undefined;
        if (!verifyMetaSignature((req as any).rawBody, signature, appSecret)) {
            this.logger.warn('[whatsapp-webhook] Firma inválida, se rechaza el request');
            return res.status(401).json({ status: 'invalid signature' });
        }

        // Meta exige 200 en pocos segundos o reintenta: se responde ya y se procesa aparte.
        // Los fallos se capturan en Sentry porque ya no pueden reflejarse en la respuesta HTTP.
        res.status(200).json({ success: true });
        this.whatsappService.processWebhookPayload(payload).catch(err => {
            console.error('[WhatsApp Webhook Error]', err);
            Sentry.captureException(err);
        });
    }
}
