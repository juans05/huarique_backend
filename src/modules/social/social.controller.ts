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
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SocialAccount } from './entities/social-account.entity';
import { SocialComment } from './entities/social-comment.entity';
import { SocialBotRule } from './entities/social-bot-rule.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('social')
@Controller('business/places/:placeId/social')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SocialController {
    constructor(
        @InjectRepository(SocialAccount)
        private accountsRepo: Repository<SocialAccount>,
        @InjectRepository(SocialComment)
        private commentsRepo: Repository<SocialComment>,
        @InjectRepository(SocialBotRule)
        private rulesRepo: Repository<SocialBotRule>,
    ) {}

    // ══════════════════════════════════════════════════
    // CUENTAS — Soporta MÚLTIPLES cuentas por empresa
    // Ej: Empresa 1 → @restaurante_lima
    //     Empresa 2 → @cevicheria_miraflores + @cevicheria_barranco
    // ══════════════════════════════════════════════════

    @Get('accounts')
    @ApiOperation({ summary: 'Get ALL connected social accounts for this place' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async getAccounts(@Param('placeId') placeId: string) {
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

    @Post('connect')
    @ApiOperation({ summary: 'Connect a NEW Instagram account (allows multiple per place)' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async connectAccount(
        @Param('placeId') placeId: string,
        @Body() body: { accessToken: string; platformUserId: string; platformUsername: string },
    ) {
        // Verificar que NO se repita la misma cuenta de Instagram
        const existing = await this.accountsRepo.findOne({
            where: { placeId, platformUserId: body.platformUserId, isActive: true },
        });
        if (existing) {
            throw new ConflictException(
                `La cuenta @${body.platformUsername} ya está vinculada a este local.`,
            );
        }

        const account = this.accountsRepo.create({
            placeId,
            platform: 'instagram',
            accessToken: body.accessToken,
            platformUserId: body.platformUserId,
            platformUsername: body.platformUsername,
            isActive: true,
        });

        return this.accountsRepo.save(account);
    }

    @Delete('accounts/:accountId')
    @ApiOperation({ summary: 'Disconnect (deactivate) a specific social account' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    @ApiParam({ name: 'accountId', description: 'Social Account UUID' })
    async disconnectAccount(
        @Param('placeId') placeId: string,
        @Param('accountId') accountId: string,
    ) {
        const account = await this.accountsRepo.findOne({
            where: { id: accountId, placeId },
        });
        if (!account) throw new NotFoundException('Cuenta no encontrada');

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
        @Param('placeId') placeId: string,
        @Query('page') page = 1,
        @Query('accountId') accountId?: string,
    ) {
        // Buscar todas las cuentas activas (o una específica si se filtra)
        const whereAccount: any = { placeId, isActive: true };
        if (accountId) whereAccount.id = accountId;

        const accounts = await this.accountsRepo.find({ where: whereAccount });
        if (accounts.length === 0) return { data: [], meta: { total: 0 } };

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
        };
    }

    @Post('comments/:commentId/reply')
    @ApiOperation({ summary: 'Send a manual reply to a comment' })
    async replyToComment(
        @Param('commentId') commentId: string,
        @Body() body: { reply: string },
    ) {
        await this.commentsRepo.update(commentId, {
            manualReply: body.reply,
            isReplied: true,
        });

        // TODO: In Phase 2, this will also call Meta Graph API to post the reply
        return { message: 'Respuesta guardada' };
    }

    // ══════════════════════════════════════════════════
    // REGLAS DEL BOT — Una configuración por empresa
    // (aplica a todas las cuentas de ese local)
    // ══════════════════════════════════════════════════

    @Get('rules')
    @ApiOperation({ summary: 'Get AI bot rules for this place' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async getRules(@Param('placeId') placeId: string) {
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
            });
            rules = await this.rulesRepo.save(rules);
        }
        return rules;
    }

    @Put('rules')
    @ApiOperation({ summary: 'Update AI bot rules for this place' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async updateRules(
        @Param('placeId') placeId: string,
        @Body() body: Partial<SocialBotRule>,
    ) {
        let rules = await this.rulesRepo.findOne({ where: { placeId } });
        if (!rules) {
            rules = this.rulesRepo.create({ placeId, ...body });
        } else {
            Object.assign(rules, body);
        }
        return this.rulesRepo.save(rules);
    }
}
