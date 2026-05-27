import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { ConfigService } from '@nestjs/config';

@Controller('business/webhooks')
export class WhatsappController {
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
        const secretToken = this.configService.get<string>('WHATSAPP_WEBHOOK_TOKEN') || 'wuarike_webhook_verification_token_2026';
        if (mode === 'subscribe' && token === secretToken) {
            return challenge;
        }
        return 'Forbidden';
    }

    // Receive incoming chats from Meta (POST)
    @Post('whatsapp')
    @HttpCode(HttpStatus.OK)
    async handleIncomingMessage(@Body() payload: any) {
        // Run asynchronously to return 200 HTTP code in under 20 seconds to Meta
        this.whatsappService.processWebhookPayload(payload).catch(err => {
            console.error('[WhatsApp Webhook Error]', err);
        });
        return { success: true };
    }
}
