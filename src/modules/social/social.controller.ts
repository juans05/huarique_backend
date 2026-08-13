import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Query,
    UseGuards,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SocialAccount } from './entities/social-account.entity';
import { SocialComment } from './entities/social-comment.entity';
import { SocialBotRule } from './entities/social-bot-rule.entity';
import { Place } from '../places/entities/place.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZernioService } from './zernio.service';

@ApiTags('social')
@Controller('business/places/:placeId/social')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SocialController {
    private readonly logger = new Logger(SocialController.name);

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
    ) {}

    private async assertOwner(placeId: string, userId: string) {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
        return place;
    }

    // ══════════════════════════════════════════════════
    // CUENTAS — Soporta MÚLTIPLES cuentas por empresa
    // Ej: Empresa 1 → @restaurante_lima
    //     Empresa 2 → @cevicheria_miraflores + @cevicheria_barranco
    // ══════════════════════════════════════════════════

    @Get('accounts')
    @ApiOperation({ summary: 'Get ALL connected social accounts for this place' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async getAccounts(@CurrentUser() user: any, @Param('placeId') placeId: string) {
        await this.assertOwner(placeId, user.id);
        const accounts = await this.accountsRepo.find({
            where: { placeId, isActive: true },
            order: { createdAt: 'DESC' },
        });

        return {
            connected: accounts.length > 0,
            total: accounts.length,
            accounts: accounts.map(a => ({
                id: a.id,
                platform: a.platform,
                username: a.platformUsername,
                connectedAt: a.createdAt,
            })),
        };
    }

    @Get('connect-url')
    @ApiOperation({ summary: 'Get the Zernio OAuth URL to connect a new Instagram/Facebook account' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async getConnectUrl(
        @CurrentUser() user: any,
        @Param('placeId') placeId: string,
        @Query('platform') platform: string,
    ) {
        const place = await this.assertOwner(placeId, user.id);
        if (!['instagram', 'facebook'].includes(platform)) {
            throw new BadRequestException('Plataforma no soportada. Usa instagram o facebook.');
        }

        let profileId = place.metadata?.zernioProfileId;
        // state anti-CSRF: de un solo uso, expira a los 10 min, atado a este place — el
        // callback lo exige para no aceptar redirects que no vinieron de este connect-url.
        const state = randomBytes(32).toString('base64url');
        const stateExpiresAt = Date.now() + 10 * 60 * 1000;

        if (!profileId) {
            profileId = await this.zernio.createProfile(place.name || `place-${placeId}`);
        }
        place.metadata = {
            ...(place.metadata || {}),
            zernioProfileId: profileId,
            zernioOauthState: state,
            zernioOauthStateExpiresAt: stateExpiresAt,
        };
        await this.placesRepo.save(place);

        const backendUrl = process.env.ZERNIO_REDIRECT_BASE_URL || 'https://backendwarike-production.up.railway.app';
        const redirectUrl = `${backendUrl}/api/business/places/${placeId}/social/zernio-callback?state=${state}`;
        const authUrl = await this.zernio.generateConnectUrl(profileId, platform, redirectUrl);
        return { authUrl };
    }

    @Delete('accounts/:accountId')
    @ApiOperation({ summary: 'Disconnect a specific social account (also revokes it on Zernio when applicable)' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    @ApiParam({ name: 'accountId', description: 'Social Account UUID' })
    async disconnectAccount(
        @CurrentUser() user: any,
        @Param('placeId') placeId: string,
        @Param('accountId') accountId: string,
    ) {
        const place = await this.assertOwner(placeId, user.id);
        const account = await this.accountsRepo.findOne({
            where: { id: accountId, placeId },
        });
        if (!account) throw new NotFoundException('Cuenta no encontrada');

        const profileId = place.metadata?.zernioProfileId;
        if (account.provider === 'zernio' && profileId && account.platformUserId) {
            try {
                await this.zernio.disconnectAccount(account.platformUserId, profileId);
            } catch (err) {
                this.logger.warn(`No se pudo desconectar la cuenta en Zernio (${account.platformUserId}): ${err.message}`);
            }
        }

        account.isActive = false;
        await this.accountsRepo.save(account);
        return { message: `Cuenta @${account.platformUsername} desvinculada` };
    }

    // ══════════════════════════════════════════════════
    // COMENTARIOS — Agregados de TODAS las cuentas activas
    // ══════════════════════════════════════════════════

    @Get('comments')
    @ApiOperation({ summary: 'Get recent comments from ALL connected accounts' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async getComments(
        @CurrentUser() user: any,
        @Param('placeId') placeId: string,
        @Query('page') page = 1,
        @Query('accountId') accountId?: string,
    ) {
        const place = await this.assertOwner(placeId, user.id);
        // Buscar todas las cuentas activas (o una específica si se filtra)
        const whereAccount: any = { placeId, isActive: true };
        if (accountId) whereAccount.id = accountId;

        const accounts = await this.accountsRepo.find({ where: whereAccount });
        if (accounts.length === 0) return { data: [], meta: { total: 0 }, notice: null };

        let notice: string | null = null;
        const zernioAccounts = accounts.filter(a => a.provider === 'zernio');
        const profileId = place.metadata?.zernioProfileId;
        if (zernioAccounts.length > 0 && profileId) {
            const supported = zernioAccounts.filter(a => this.zernio.supportsComments(a.platform));
            if (supported.length === 0) {
                notice = `Las cuentas conectadas (${zernioAccounts.map(a => a.platform).join(', ')}) no soportan lectura de comentarios por API. Conecta Instagram o Facebook.`;
            } else {
                try {
                    await this.syncZernioComments(profileId, supported);
                } catch (err) {
                    this.logger.warn(`No se pudo sincronizar comentarios de Zernio para place ${placeId}: ${err.message}`);
                }
            }
        }

        const accountIds = accounts.map(a => a.id);
        const size = 20;
        const [data, total] = await this.commentsRepo.findAndCount({
            where: { socialAccountId: In(accountIds) },
            relations: ['socialAccount'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });

        return {
            data: data.map(c => ({
                ...c,
                accountUsername: c.socialAccount?.platformUsername || 'unknown',
            })),
            meta: { total, page, size, totalPages: Math.ceil(total / size) },
            notice,
        };
    }

    // Zernio no tiene webhook de "nuevo comentario" (pull-only): GET /inbox/comments a nivel de
    // perfil solo devuelve POSTS con un commentCount — hay que pedir los comentarios reales
    // post por post. Se cachean localmente para no perder sentimiento/respuestas ya calculadas.
    private async syncZernioComments(profileId: string, accounts: SocialAccount[]) {
        const byAccountId = new Map(accounts.map(a => [a.platformUserId, a]));
        const result = await this.zernio.getProfilePosts(profileId, 50);
        const posts = result?.data || result?.posts || [];

        for (const post of posts) {
            const account = byAccountId.get(post.accountId || post.account_id);
            if (!account || !post.commentCount) continue;
            const postId = post.id || post._id || post.postId;
            if (!postId) continue;

            const commentsResult = await this.zernio.getPostComments(postId, account.platformUserId, 50);
            // Forma real según el OpenAPI de Zernio (GET /v1/inbox/comments/{postId}):
            // { comments: [{ id, message, createdTime, from: { username, name, picture } }] }
            const rawComments = commentsResult?.comments || [];

            for (const raw of rawComments) {
                const platformCommentId = raw.id;
                if (!platformCommentId) continue;

                const values = {
                    socialAccountId: account.id,
                    platformCommentId,
                    platformPostId: postId,
                    authorUsername: raw.from?.username || raw.from?.name || 'desconocido',
                    authorProfilePic: raw.from?.picture || null,
                    text: raw.message || '',
                    platformCreatedAt: raw.createdTime ? new Date(raw.createdTime) : null,
                };

                const existing = await this.commentsRepo.findOne({ where: { platformCommentId } });
                // Reintenta los que quedaron con datos de respaldo de una sincronización previa
                // rota, en vez de dejarlos "desconocido"/vacíos para siempre.
                if (existing && existing.authorUsername !== 'desconocido' && existing.text) continue;

                if (existing) {
                    Object.assign(existing, values);
                    await this.commentsRepo.save(existing);
                } else {
                    await this.commentsRepo.save(this.commentsRepo.create(values));
                }
            }
        }
    }

    @Post('comments/:commentId/reply')
    @ApiOperation({ summary: 'Send a reply to a comment (posts to Zernio when the account is Zernio-connected)' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async replyToComment(
        @CurrentUser() user: any,
        @Param('placeId') placeId: string,
        @Param('commentId') commentId: string,
        @Body() body: { reply: string },
    ) {
        await this.assertOwner(placeId, user.id);
        const comment = await this.commentsRepo.findOne({
            where: { id: commentId },
            relations: ['socialAccount'],
        });
        if (!comment || comment.socialAccount?.placeId !== placeId) {
            throw new NotFoundException('Comentario no encontrado');
        }

        if (comment.socialAccount.provider === 'zernio') {
            await this.zernio.postCommentReply(
                comment.platformPostId,
                comment.socialAccount.platformUserId,
                body.reply,
                comment.platformCommentId,
            );
        }

        await this.commentsRepo.update(commentId, {
            manualReply: body.reply,
            isReplied: true,
        });

        return { message: 'Respuesta enviada' };
    }

    // ══════════════════════════════════════════════════
    // MENSAJES DIRECTOS (DM) — Zernio no tiene webhook de
    // "nuevo mensaje", se consultan en vivo (sin caché local)
    // ══════════════════════════════════════════════════

    private async assertOwnZernioAccount(placeId: string, accountId: string): Promise<SocialAccount> {
        const account = await this.accountsRepo.findOne({
            where: { placeId, platformUserId: accountId, provider: 'zernio', isActive: true },
        });
        if (!account) throw new ForbiddenException('Esa cuenta no pertenece a este local');
        return account;
    }

    @Get('conversations')
    @ApiOperation({ summary: 'Get DM conversations from ALL connected Zernio accounts' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async getConversations(@CurrentUser() user: any, @Param('placeId') placeId: string) {
        const place = await this.assertOwner(placeId, user.id);
        const profileId = place.metadata?.zernioProfileId;
        const zernioAccounts = await this.accountsRepo.find({
            where: { placeId, isActive: true, provider: 'zernio' },
        });
        if (!profileId || zernioAccounts.length === 0) return { data: [] };

        try {
            const result = await this.zernio.getConversations(profileId, 30);
            return { data: result?.data || [] };
        } catch (err) {
            this.logger.warn(`No se pudieron cargar conversaciones de Zernio para place ${placeId}: ${err.message}`);
            return { data: [] };
        }
    }

    @Get('conversations/:conversationId/messages')
    @ApiOperation({ summary: 'Get the message thread for a DM conversation' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async getConversationMessages(
        @CurrentUser() user: any,
        @Param('placeId') placeId: string,
        @Param('conversationId') conversationId: string,
        @Query('accountId') accountId: string,
    ) {
        await this.assertOwner(placeId, user.id);
        await this.assertOwnZernioAccount(placeId, accountId);
        const result = await this.zernio.getConversationMessages(conversationId, accountId, 50);
        return { data: result?.messages || [] };
    }

    @Post('conversations/:conversationId/messages')
    @ApiOperation({ summary: 'Send a DM reply in an existing conversation' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async replyToConversation(
        @CurrentUser() user: any,
        @Param('placeId') placeId: string,
        @Param('conversationId') conversationId: string,
        @Body() body: { accountId: string; message: string },
    ) {
        await this.assertOwner(placeId, user.id);
        await this.assertOwnZernioAccount(placeId, body.accountId);
        await this.zernio.sendMessage(conversationId, body.accountId, body.message);
        return { message: 'Mensaje enviado' };
    }

    // ══════════════════════════════════════════════════
    // REGLAS DEL BOT — Una configuración por empresa
    // (aplica a todas las cuentas de ese local)
    // ══════════════════════════════════════════════════

    @Get('rules')
    @ApiOperation({ summary: 'Get AI bot rules for this place' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async getRules(@CurrentUser() user: any, @Param('placeId') placeId: string) {
        await this.assertOwner(placeId, user.id);
        let rules = await this.rulesRepo.findOne({ where: { placeId } });
        if (!rules) {
            rules = this.rulesRepo.create({
                placeId,
                replyToQuestions: true,
                replyToCompliments: true,
                redirectComplaints: true,
                revealPrices: false,
                personality: 'friendly',
                isActive: true,
                dmBotEnabled: false,
            });
            rules = await this.rulesRepo.save(rules);
        }
        return rules;
    }

    @Put('rules')
    @ApiOperation({ summary: 'Update AI bot rules for this place' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async updateRules(
        @CurrentUser() user: any,
        @Param('placeId') placeId: string,
        @Body() body: Partial<SocialBotRule>,
    ) {
        await this.assertOwner(placeId, user.id);
        let rules = await this.rulesRepo.findOne({ where: { placeId } });
        if (!rules) {
            rules = this.rulesRepo.create({ placeId, ...body });
        } else {
            Object.assign(rules, body);
        }
        return this.rulesRepo.save(rules);
    }
}
