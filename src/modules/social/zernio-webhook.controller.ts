import { Controller, Post, Req, Res, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Sentry from '@sentry/nestjs';
import { SocialAccount } from './entities/social-account.entity';
import { SocialComment } from './entities/social-comment.entity';
import { SocialBotRule } from './entities/social-bot-rule.entity';
import { Place } from '../places/entities/place.entity';
import { ZernioService } from './zernio.service';
import { SocialAiService } from './social-ai.service';

// Recibe eventos en tiempo real de Zernio (comment.received, message.received) y,
// si el bot está activado para esa sede, genera una respuesta con IA y la publica.
// Sin JwtAuthGuard a propósito — Zernio no manda un JWT nuestro, la autenticidad se
// valida con la firma HMAC (mismo patrón que el resto de webhooks públicos del backend).
@Controller('webhooks/zernio')
export class ZernioWebhookController {
    private readonly logger = new Logger(ZernioWebhookController.name);

    constructor(
        @InjectRepository(SocialAccount)
        private accountsRepo: Repository<SocialAccount>,
        @InjectRepository(SocialComment)
        private commentsRepo: Repository<SocialComment>,
        @InjectRepository(SocialBotRule)
        private rulesRepo: Repository<SocialBotRule>,
        @InjectRepository(Place)
        private placesRepo: Repository<Place>,
        private zernio: ZernioService,
        private socialAi: SocialAiService,
    ) {}

    @Post()
    async handleWebhook(@Req() req: Request, @Res() res: Response) {
        const signature = req.headers['x-zernio-signature'] as string | undefined;
        const secret = process.env.ZERNIO_WEBHOOK_SECRET;
        const rawBody = (req as any).rawBody as Buffer | undefined;

        if (secret && rawBody) {
            const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
            const provided = (signature || '').replace(/^sha256=/, '');
            const valid = provided.length === expected.length
                && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
            if (!valid) {
                this.logger.warn('[zernio-webhook] Firma inválida, se rechaza el request');
                return res.status(401).json({ status: 'invalid signature' });
            }
        }

        // Siempre 200 desde acá para abajo — Zernio desactiva el webhook después de
        // 10 fallos de entrega seguidos, y un error nuestro procesando el payload
        // no debería contar como fallo de entrega.
        res.status(200).json({ status: 'ok' });

        const payload = req.body;
        try {
            if (payload?.event === 'comment.received') {
                await this.handleCommentReceived(payload);
            } else if (payload?.event === 'message.received') {
                await this.handleMessageReceived(payload);
            }
        } catch (error) {
            this.logger.error(`[zernio-webhook] Error procesando evento "${payload?.event}": ${error?.message}`, error?.stack);
            Sentry.captureException(error);
        }
    }

    private async handleCommentReceived(payload: any) {
        const comment = payload.comment;
        const accountId = payload.account?.id || payload.account?.accountId;
        if (!comment?.id || !accountId) return;

        const account = await this.accountsRepo.findOne({ where: { platformUserId: accountId, provider: 'zernio', isActive: true } });
        if (!account) return;

        // Guarda/actualiza siempre el comentario, aunque el bot esté apagado — así el
        // panel lo muestra en cuanto llega, sin esperar al próximo sync por polling.
        let record = await this.commentsRepo.findOne({ where: { platformCommentId: comment.id } });
        if (!record) record = this.commentsRepo.create({ platformCommentId: comment.id });
        record.socialAccountId = account.id;
        record.platformPostId = comment.platformPostId || comment.postId || null;
        record.authorUsername = comment.author?.username || comment.author?.name || 'desconocido';
        record.authorProfilePic = comment.author?.picture || null;
        record.text = comment.text || '';
        record.platformCreatedAt = comment.createdAt ? new Date(comment.createdAt) : null;
        await this.commentsRepo.save(record);

        if (comment.isReply || !comment.text) return; // no auto-respondemos hilos ni comentarios vacíos (stickers, etc.)

        const place = await this.placesRepo.findOne({ where: { id: account.placeId } });
        const rule = await this.rulesRepo.findOne({ where: { placeId: account.placeId } });
        if (!place || !rule?.isActive) return;

        const replyText = await this.socialAi.generateCommentReply(rule, place.name, comment.text);
        if (!replyText) return;

        await this.zernio.postCommentReply(comment.platformPostId, account.platformUserId, replyText, comment.id);

        record.aiReply = replyText;
        record.aiRepliedAt = new Date();
        record.isReplied = true;
        await this.commentsRepo.save(record);
        this.logger.log(`[zernio-webhook] Respondido comentario ${comment.id} de la cuenta ${account.platformUsername}`);
    }

    private async handleMessageReceived(payload: any) {
        const message = payload.message;
        const accountId = payload.account?.id || payload.account?.accountId;
        if (!message?.id || !accountId) return;
        if (message.direction !== 'incoming' || !message.text) return; // ignora eco de mensajes salientes y adjuntos sin texto

        const account = await this.accountsRepo.findOne({ where: { platformUserId: accountId, provider: 'zernio', isActive: true } });
        if (!account) return;

        const place = await this.placesRepo.findOne({ where: { id: account.placeId } });
        const rule = await this.rulesRepo.findOne({ where: { placeId: account.placeId } });
        if (!place || !rule?.dmBotEnabled) return;

        const replyText = await this.socialAi.generateDmReply(rule, place.name, message.text);
        if (!replyText) return;

        await this.zernio.sendMessage(message.conversationId, account.platformUserId, replyText);
        this.logger.log(`[zernio-webhook] Respondido DM en conversación ${message.conversationId} de la cuenta ${account.platformUsername}`);
    }
}
