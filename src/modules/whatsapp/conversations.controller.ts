import { Controller, Get, Post, Patch, Param, Body, UseGuards, Query, Sse, Req, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { Place } from '../places/entities/place.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsPublic } from '../../common/decorators/is-public.decorator';
import { WhatsappService } from './whatsapp.service';
import { PlazBotService } from '../plazbot/plazbot.service';
import { JwtService } from '@nestjs/jwt';
import { SubscriptionTierGuard } from '../../common/guards/subscription-tier.guard';
import { RequiresTier } from '../../common/decorators/requires-tier.decorator';
import { PlaceRoleGuard, ROLE_RANK } from '../../common/guards/place-role.guard';
import { RequiresPlaceRole } from '../../common/decorators/requires-place-role.decorator';
import { PlaceTeamService } from '../team/place-team.service';
import { PlaceTeamMember, PlaceTeamRole } from '../team/entities/place-team-member.entity';

// Note: SubscriptionTierGuard + @RequiresTier are applied per-method below, not at
// class level — the `stream` SSE endpoint is @IsPublic (auth via query-param token,
// no `request.user`), so a class-level tier guard would crash on that route.
@UseGuards(JwtAuthGuard)
@Controller('business/conversations')
export class ConversationsController {
    constructor(
        @InjectRepository(Conversation)
        private conversationRepo: Repository<Conversation>,
        @InjectRepository(Message)
        private messageRepo: Repository<Message>,
        @InjectRepository(WhatsAppNumber)
        private whatsappNumberRepo: Repository<WhatsAppNumber>,
        @InjectRepository(Place)
        private placesRepository: Repository<Place>,
        private whatsappService: WhatsappService,
        private plazbotService: PlazBotService,
        private eventEmitter: EventEmitter2,
        private jwtService: JwtService,
        private placeTeamService: PlaceTeamService,
    ) { }

    private async assertOwner(placeId: string, userId: string) {
        const place = await this.placesRepository.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
        return place;
    }

    // List conversations for a place (paginated, filtrado por rol y números visibles)
    @UseGuards(SubscriptionTierGuard, PlaceRoleGuard)
    @RequiresTier('ia_total')
    @RequiresPlaceRole('agente')
    @Get(':placeId')
    async getConversations(
        @Param('placeId') placeId: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20',
        @Query('status') status: string | undefined,
        @Query('filter') filter: 'mine' | 'unassigned' | 'all' | undefined,
        @CurrentUser() user: any,
        @Req() req: any,
    ) {
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 20;
        const skip = (pageNum - 1) * limitNum;

        const qb = this.conversationRepo.createQueryBuilder('c').where('c.place_id = :placeId', { placeId });

        const accessibleNumbers = req.accessibleWhatsappNumberIds as string[] | 'all';
        if (accessibleNumbers !== 'all') {
            if (accessibleNumbers.length === 0) return { data: [], meta: { total: 0, page: pageNum, limit: limitNum, totalPages: 0 } };
            qb.andWhere('c.whatsapp_number_id IN (:...ids)', { ids: accessibleNumbers });
        }

        if (status) qb.andWhere('c.status = :status', { status });

        const requestedFilter = filter ?? (req.placeTeamMember.role === 'agente' ? 'unassigned' : 'all');
        // Un agente nunca puede pedir 'all' vía query param — solo Admin/Supervisor tienen
        // visibilidad sin restricción de asignación. No confiamos en que el frontend oculte
        // la opción (mismo tipo de gap que el IDOR de Task 6).
        const effectiveFilter = req.placeTeamMember.role === 'agente' && requestedFilter === 'all' ? 'unassigned' : requestedFilter;
        if (effectiveFilter === 'mine') {
            qb.andWhere('c.assigned_to_user_id = :userId', { userId: user.id });
        } else if (effectiveFilter === 'unassigned') {
            qb.andWhere('(c.assigned_to_user_id IS NULL OR c.assigned_to_user_id = :userId)', { userId: user.id });
        }
        // 'all' (solo Admin/Supervisor) — sin filtro extra de asignación

        qb.orderBy('c.created_at', 'DESC').skip(skip).take(limitNum);

        const [conversations, total] = await qb.getManyAndCount();

        const withLastMessage = await Promise.all(
            conversations.map(async (conv) => {
                const lastMessage = await this.messageRepo.findOne({
                    where: { conversationId: conv.id },
                    order: { createdAt: 'DESC' }
                });
                return {
                    ...conv,
                    lastMessage: lastMessage?.messageBody || '',
                    lastMessageTime: lastMessage?.createdAt
                };
            })
        );

        return {
            data: withLastMessage,
            meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
        };
    }

    /**
     * Resuelve la conversación + la membresía del usuario en su sede, valida rol mínimo y
     * acceso al número de WhatsApp de la conversación. Único punto de autorización para
     * todas las rutas de :conversationId — evita que un agente lea/actúe sobre una
     * conversación de un número al que no tiene acceso, o de una sede en la que no está.
     */
    private async assertConversationAccess(
        conversationId: string,
        userId: string,
        minRole?: PlaceTeamRole,
    ): Promise<{ conversation: Conversation; member: PlaceTeamMember }> {
        const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
        if (!conversation) throw new NotFoundException('Conversation not found');

        const member = await this.placeTeamService.getMembership(userId, conversation.placeId);
        if (!member) throw new ForbiddenException('No tenés acceso a esta sede');

        if (minRole && ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
            throw new ForbiddenException('No tenés el rol necesario para esta acción');
        }

        if (conversation.whatsappNumberId && member.role === 'agente') {
            const accessibleIds = await this.placeTeamService.getAccessibleWhatsappNumberIds(member);
            if (accessibleIds !== 'all' && !accessibleIds.includes(conversation.whatsappNumberId)) {
                throw new ForbiddenException('No tenés acceso a este número de WhatsApp');
            }
        }

        return { conversation, member };
    }

    // Get messages for a conversation
    @UseGuards(SubscriptionTierGuard)
    @RequiresTier('ia_total')
    @Get(':conversationId/messages')
    async getConversationMessages(
        @Param('conversationId') conversationId: string,
        @Query('limit') limit: string = '100',
        @CurrentUser() user: any,
    ) {
        await this.assertConversationAccess(conversationId, user.id);
        const limitNum = parseInt(limit) || 100;

        const messages = await this.messageRepo.find({
            where: { conversationId },
            order: { createdAt: 'ASC' },
            take: limitNum
        });

        return { data: messages, total: messages.length };
    }

    // Change conversation mode (bot or human)
    @UseGuards(SubscriptionTierGuard)
    @RequiresTier('ia_total')
    @Patch(':conversationId/mode')
    async setConversationMode(
        @Param('conversationId') conversationId: string,
        @CurrentUser() user: any,
        @Body() body: { mode: 'bot' | 'human' }
    ) {
        if (!['bot', 'human'].includes(body.mode)) {
            throw new BadRequestException('mode must be "bot" or "human"');
        }

        const { conversation } = await this.assertConversationAccess(conversationId, user.id);
        conversation.mode = body.mode;
        await this.conversationRepo.save(conversation);

        return { data: conversation, message: `Conversation mode changed to ${body.mode}` };
    }

    // Send manual message from operator
    @UseGuards(SubscriptionTierGuard)
    @RequiresTier('ia_total')
    @Post(':conversationId/messages')
    async sendManualMessage(
        @Param('conversationId') conversationId: string,
        @CurrentUser() user: any,
        @Body() body: { text: string }
    ) {
        if (!body.text || body.text.trim().length === 0) {
            throw new BadRequestException('text is required and cannot be empty');
        }

        const { conversation } = await this.assertConversationAccess(conversationId, user.id);

        const message = this.messageRepo.create({
            conversationId: conversation.id,
            messageType: 'OUTGOING',
            messageBody: body.text,
            isFromAi: false
        });
        await this.messageRepo.save(message);

        const apiKey = process.env.PLAZBOT_API_KEY || '';
        const workspaceId = process.env.PLAZBOT_WORKSPACE_ID || '';
        await this.plazbotService.sendMessage(apiKey, workspaceId, conversation.customerPhone, body.text);

        return { data: message, message: 'Message sent successfully' };
    }

    // Reclamar una conversación sin asignar — UPDATE atómico, 409 si ya la tomó otro
    @UseGuards(SubscriptionTierGuard)
    @RequiresTier('ia_total')
    @Post(':conversationId/claim')
    async claim(@Param('conversationId') conversationId: string, @CurrentUser() user: any) {
        await this.assertConversationAccess(conversationId, user.id);

        const result = await this.conversationRepo
            .createQueryBuilder()
            .update(Conversation)
            .set({ assignedToUserId: user.id, status: 'pendiente', mode: 'human' })
            .where('id = :id AND assigned_to_user_id IS NULL', { id: conversationId })
            .execute();

        if (result.affected === 0) {
            throw new ConflictException('Esta conversación ya fue reclamada por otro agente');
        }

        return this.conversationRepo.findOne({ where: { id: conversationId } });
    }

    // Soltar una conversación (vuelve a sin asignar) — solo Supervisor/Admin
    @UseGuards(SubscriptionTierGuard)
    @RequiresTier('ia_total')
    @Post(':conversationId/release')
    async release(@Param('conversationId') conversationId: string, @CurrentUser() user: any) {
        const { conversation } = await this.assertConversationAccess(conversationId, user.id, 'supervisor');

        conversation.assignedToUserId = null;
        conversation.status = 'abierto';
        await this.conversationRepo.save(conversation);
        return conversation;
    }

    // Reasignar a otro agente — solo Supervisor/Admin
    @UseGuards(SubscriptionTierGuard)
    @RequiresTier('ia_total')
    @Post(':conversationId/reassign')
    async reassign(
        @Param('conversationId') conversationId: string,
        @CurrentUser() user: any,
        @Body() body: { userId: string },
    ) {
        const { conversation } = await this.assertConversationAccess(conversationId, user.id, 'supervisor');

        const targetMember = await this.placeTeamService.getMembership(body.userId, conversation.placeId);
        if (!targetMember) {
            throw new BadRequestException('El usuario destino no es parte del equipo de esta sede');
        }

        conversation.assignedToUserId = body.userId;
        conversation.status = 'pendiente';
        await this.conversationRepo.save(conversation);
        return conversation;
    }

    // Cerrar — cualquier rol, pero un Agente solo si es la suya
    @UseGuards(SubscriptionTierGuard)
    @RequiresTier('ia_total')
    @Post(':conversationId/close')
    async close(@Param('conversationId') conversationId: string, @CurrentUser() user: any) {
        const { conversation, member } = await this.assertConversationAccess(conversationId, user.id);

        if (member.role === 'agente' && conversation.assignedToUserId !== user.id) {
            throw new ForbiddenException('Solo podés cerrar tus propias conversaciones');
        }

        conversation.status = 'cerrado';
        conversation.closedAt = new Date();
        await this.conversationRepo.save(conversation);
        return conversation;
    }

    // Sync existing PlazBot conversations into wuarikes DB
    @UseGuards(SubscriptionTierGuard)
    @RequiresTier('ia_total')
    @Post('sync-plazbot/:placeId')
    async syncFromPlazbot(@CurrentUser() user: any, @Param('placeId') placeId: string) {
        await this.assertOwner(placeId, user.id);
        const apiKey = process.env.PLAZBOT_API_KEY || '';
        const workspaceId = process.env.PLAZBOT_WORKSPACE_ID || '';

        const waNumbers = await this.whatsappNumberRepo.find({ where: { placeId, isActive: true } });
        const restaurantPhones = new Set(waNumbers.map(n => n.phoneNumber));

        const plazbotConvs = await this.plazbotService.listConversations(apiKey, workspaceId);

        let synced = 0;
        for (const pc of plazbotConvs) {
            const customerPhone: string = pc.platformSenderPhone || '';
            const restaurantPhone: string = pc.internalWhatsappNumber || '';
            if (!customerPhone || !restaurantPhones.has(restaurantPhone)) continue;

            // Find or create conversation in wuarikes DB
            let conv = await this.conversationRepo.findOne({ where: { placeId, customerPhone } });
            if (!conv) {
                conv = this.conversationRepo.create({
                    placeId,
                    customerPhone,
                    customerName: pc.platformSenderName || customerPhone,
                    mode: 'bot',
                });
                await this.conversationRepo.save(conv);
            }

            // Import messages
            const plazbotMessages = await this.plazbotService.getMessages(apiKey, workspaceId, pc.id);
            for (const pm of plazbotMessages) {
                const alreadySaved = await this.messageRepo.findOne({ where: { whatsappMessageId: pm.id } });
                if (alreadySaved) continue;

                await this.messageRepo.save(this.messageRepo.create({
                    conversationId: conv.id,
                    messageType: pm.answerAgentId ? 'OUTGOING' : 'INCOMING',
                    messageBody: pm.content || '',
                    isFromAi: !!pm.answerAgentId,
                    whatsappMessageId: pm.id,
                }));
            }
            synced++;
        }

        return { synced, total: plazbotConvs.length };
    }

    // SSE stream for real-time message notifications
    @IsPublic()
    @Sse('stream/:placeId')
    stream(
        @Param('placeId') placeId: string,
        @Req() req: any
    ): Observable<any> {
        // Validate JWT from query parameter
        const token = req.query.token;
        if (!token) {
            throw new BadRequestException('Token is required');
        }

        try {
            this.jwtService.verify(token);
        } catch (error) {
            throw new BadRequestException('Invalid or expired token');
        }

        return new Observable(subscriber => {
            const handler = (data: any) => {
                if (data.placeId === placeId) {
                    subscriber.next({ data });
                }
            };

            this.eventEmitter.on('whatsapp.message.received', handler);

            return () => {
                this.eventEmitter.off('whatsapp.message.received', handler);
            };
        });
    }
}
