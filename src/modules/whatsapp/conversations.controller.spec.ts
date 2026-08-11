import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { Place } from '../places/entities/place.entity';
import { WhatsappService } from './whatsapp.service';
import { PlazBotService } from '../plazbot/plazbot.service';
import { PlaceTeamService } from '../team/place-team.service';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('ConversationsController.claim', () => {
    let controller: ConversationsController;
    let queryBuilderMock: any;
    let conversationRepo: any;
    let placeTeamService: { getMembership: jest.Mock; getAccessibleWhatsappNumberIds: jest.Mock; assertPlaceTier: jest.Mock };

    beforeEach(async () => {
        queryBuilderMock = {
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            execute: jest.fn(),
        };
        conversationRepo = {
            createQueryBuilder: jest.fn(() => queryBuilderMock),
            findOne: jest.fn(),
            save: jest.fn((c) => Promise.resolve(c)),
        };
        placeTeamService = {
            getMembership: jest.fn().mockResolvedValue({ id: 'm1', role: 'agente' }),
            getAccessibleWhatsappNumberIds: jest.fn().mockResolvedValue('all'),
            // Por defecto la sede tiene un plan activo — assertPlaceTier vive (y se
            // testea) en PlaceTeamService; acá solo probamos que se llama y que su
            // rechazo se propaga (ver el test de "sin suscripción activa" abajo).
            assertPlaceTier: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [ConversationsController],
            providers: [
                { provide: getRepositoryToken(Conversation), useValue: conversationRepo },
                { provide: getRepositoryToken(Message), useValue: {} },
                { provide: getRepositoryToken(WhatsAppNumber), useValue: {} },
                { provide: getRepositoryToken(Place), useValue: {} },
                { provide: WhatsappService, useValue: {} },
                { provide: PlazBotService, useValue: {} },
                { provide: PlaceTeamService, useValue: placeTeamService },
                { provide: EventEmitter2, useValue: { on: jest.fn(), off: jest.fn() } },
                { provide: JwtService, useValue: { verify: jest.fn() } },
            ],
        }).compile();

        controller = module.get(ConversationsController);
    });

    it('assigns the conversation when the atomic UPDATE affects one row', async () => {
        conversationRepo.findOne
            .mockResolvedValueOnce({ id: 'c1', placeId: 'p1', whatsappNumberId: null }) // dentro de assertConversationAccess
            .mockResolvedValueOnce({ id: 'c1', status: 'pendiente' }); // el findOne final que devuelve el resultado
        queryBuilderMock.execute.mockResolvedValue({ affected: 1 });

        const result = await controller.claim('c1', { id: 'u1' });

        expect(result.status).toBe('pendiente');
        expect(queryBuilderMock.where).toHaveBeenCalledWith(
            'id = :id AND assigned_to_user_id IS NULL',
            { id: 'c1' },
        );
    });

    it('throws 409 when the atomic UPDATE affects zero rows (ya reclamada)', async () => {
        conversationRepo.findOne.mockResolvedValueOnce({ id: 'c1', placeId: 'p1', whatsappNumberId: null });
        queryBuilderMock.execute.mockResolvedValue({ affected: 0 });

        await expect(controller.claim('c1', { id: 'u1' })).rejects.toThrow(ConflictException);
    });

    it('throws 403 when the user has no membership in the conversation place', async () => {
        conversationRepo.findOne.mockResolvedValueOnce({ id: 'c1', placeId: 'p1', whatsappNumberId: null });
        placeTeamService.getMembership.mockResolvedValueOnce(null);

        await expect(controller.claim('c1', { id: 'u1' })).rejects.toThrow(ForbiddenException);
    });

    it("throws 403 when the place's subscription doesn't cover the required tier", async () => {
        conversationRepo.findOne.mockResolvedValueOnce({ id: 'c1', placeId: 'p1', whatsappNumberId: null });
        placeTeamService.assertPlaceTier.mockRejectedValueOnce(new ForbiddenException('Esta sede necesita una suscripción activa.'));

        await expect(controller.claim('c1', { id: 'u1' })).rejects.toThrow(ForbiddenException);
    });

    it('reassign throws 400 when the target user has no membership in the place (fix round 1)', async () => {
        conversationRepo.findOne.mockResolvedValueOnce({ id: 'c1', placeId: 'p1', whatsappNumberId: null });
        placeTeamService.getMembership
            .mockResolvedValueOnce({ id: 'm1', role: 'supervisor' }) // dentro de assertConversationAccess (caller)
            .mockResolvedValueOnce(null); // chequeo del userId destino

        await expect(
            controller.reassign('c1', { id: 'caller1' }, { userId: 'ghost-user' }),
        ).rejects.toThrow(BadRequestException);
        expect(conversationRepo.save).not.toHaveBeenCalled();
    });
});
