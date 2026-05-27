import { Controller, Get, Post, Patch, Param, Body, UseGuards, Query, Sse, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, Subject } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WhatsappService } from './whatsapp.service';
import { JwtService } from '@nestjs/jwt';

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
        private whatsappService: WhatsappService,
        private eventEmitter: EventEmitter2,
        private jwtService: JwtService
    ) {}

    // List conversations for a place (paginated)
    @Get(':placeId')
    async getConversations(
        @Param('placeId') placeId: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20'
    ) {
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 20;
        const skip = (pageNum - 1) * limitNum;

        const [conversations, total] = await this.conversationRepo.findAndCount({
            where: { placeId },
            order: { createdAt: 'DESC' },
            skip,
            take: limitNum
        });

        // Add last message preview to each conversation
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
            meta: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        };
    }

    // Get messages for a conversation
    @Get(':conversationId/messages')
    async getConversationMessages(
        @Param('conversationId') conversationId: string,
        @Query('limit') limit: string = '100'
    ) {
        const limitNum = parseInt(limit) || 100;

        const messages = await this.messageRepo.find({
            where: { conversationId },
            order: { createdAt: 'ASC' },
            take: limitNum
        });

        return {
            data: messages,
            total: messages.length
        };
    }

    // Change conversation mode (bot or human)
    @Patch(':conversationId/mode')
    async setConversationMode(
        @Param('conversationId') conversationId: string,
        @Body() body: { mode: 'bot' | 'human' }
    ) {
        if (!['bot', 'human'].includes(body.mode)) {
            throw new BadRequestException('mode must be "bot" or "human"');
        }

        const conversation = await this.conversationRepo.findOne({
            where: { id: conversationId }
        });

        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        conversation.mode = body.mode;
        await this.conversationRepo.save(conversation);

        return {
            data: conversation,
            message: `Conversation mode changed to ${body.mode}`
        };
    }

    // Send manual message from operator
    @Post(':conversationId/messages')
    async sendManualMessage(
        @Param('conversationId') conversationId: string,
        @Body() body: { text: string }
    ) {
        if (!body.text || body.text.trim().length === 0) {
            throw new BadRequestException('text is required and cannot be empty');
        }

        const conversation = await this.conversationRepo.findOne({
            where: { id: conversationId },
            relations: ['place']
        });

        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        // Save outgoing message (from operator, not AI)
        const message = this.messageRepo.create({
            conversationId: conversation.id,
            messageType: 'OUTGOING',
            messageBody: body.text,
            isFromAi: false
        });
        await this.messageRepo.save(message);

        // Get active WhatsApp number for this place
        const waNumber = await this.whatsappNumberRepo.findOne({
            where: { placeId: conversation.placeId, isActive: true },
            relations: ['place']
        });

        if (!waNumber) {
            throw new BadRequestException('No active WhatsApp number configured for this place');
        }

        // Send the message via WhatsApp API
        await this.whatsappService.sendWhatsAppMessage(
            waNumber.phoneNumberId,
            waNumber.whatsappApiToken,
            conversation.customerPhone,
            body.text
        );

        return {
            data: message,
            message: 'Message sent successfully'
        };
    }

    // SSE stream for real-time message notifications
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
