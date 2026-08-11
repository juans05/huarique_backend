import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { PlaceTeamService } from './place-team.service';
import { PlaceTeamMember } from './entities/place-team-member.entity';
import { TeamMemberWhatsappAccess } from './entities/team-member-whatsapp-access.entity';
import { Place } from '../places/entities/place.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

const mockMemberRepo = () => ({
    findOne: jest.fn(),
    create: jest.fn((v) => v),
    save: jest.fn((v) => Promise.resolve({ id: 'new-member-id', ...v })),
});
const mockAccessRepo = () => ({
    find: jest.fn(),
});
const mockPlaceRepo = () => ({
    findOne: jest.fn(),
});
const mockSubscriptionsService = () => ({
    getSubscriptionForPlace: jest.fn(),
    hasTierAccess: jest.fn(),
});

describe('PlaceTeamService', () => {
    let service: PlaceTeamService;
    let memberRepo: ReturnType<typeof mockMemberRepo>;
    let placeRepo: ReturnType<typeof mockPlaceRepo>;
    let accessRepo: ReturnType<typeof mockAccessRepo>;
    let subscriptionsService: ReturnType<typeof mockSubscriptionsService>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PlaceTeamService,
                { provide: getRepositoryToken(PlaceTeamMember), useFactory: mockMemberRepo },
                { provide: getRepositoryToken(TeamMemberWhatsappAccess), useFactory: mockAccessRepo },
                { provide: getRepositoryToken(Place), useFactory: mockPlaceRepo },
                { provide: SubscriptionsService, useFactory: mockSubscriptionsService },
            ],
        }).compile();

        service = module.get(PlaceTeamService);
        memberRepo = module.get(getRepositoryToken(PlaceTeamMember));
        placeRepo = module.get(getRepositoryToken(Place));
        accessRepo = module.get(getRepositoryToken(TeamMemberWhatsappAccess));
        subscriptionsService = module.get(SubscriptionsService);
    });

    describe('getMembership', () => {
        it('returns the existing row when one exists', async () => {
            const existing = { id: 'm1', userId: 'u1', placeId: 'p1', role: 'agente' };
            memberRepo.findOne.mockResolvedValue(existing);

            const result = await service.getMembership('u1', 'p1');

            expect(result).toBe(existing);
            expect(placeRepo.findOne).not.toHaveBeenCalled();
        });

        it('lazily creates an admin row when the user is the place owner and has no row yet', async () => {
            memberRepo.findOne.mockResolvedValue(null);
            placeRepo.findOne.mockResolvedValue({ id: 'p1', claimedByUserId: 'u1' });

            const result = await service.getMembership('u1', 'p1');

            expect(memberRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'u1', placeId: 'p1', role: 'admin' }),
            );
            expect(result?.role).toBe('admin');
        });

        it('returns null when the user is neither a member nor the owner', async () => {
            memberRepo.findOne.mockResolvedValue(null);
            placeRepo.findOne.mockResolvedValue({ id: 'p1', claimedByUserId: 'someone-else' });

            const result = await service.getMembership('u1', 'p1');

            expect(result).toBeNull();
            expect(memberRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('getAccessibleWhatsappNumberIds', () => {
        it("returns 'all' for admin", async () => {
            const result = await service.getAccessibleWhatsappNumberIds({ id: 'm1', role: 'admin' } as PlaceTeamMember);
            expect(result).toBe('all');
        });

        it("returns 'all' for supervisor", async () => {
            const result = await service.getAccessibleWhatsappNumberIds({ id: 'm1', role: 'supervisor' } as PlaceTeamMember);
            expect(result).toBe('all');
        });

        it('returns the explicit list for agente', async () => {
            accessRepo.find.mockResolvedValue([{ whatsappNumberId: 'n1' }, { whatsappNumberId: 'n2' }]);
            const result = await service.getAccessibleWhatsappNumberIds({ id: 'm1', role: 'agente' } as PlaceTeamMember);
            expect(result).toEqual(['n1', 'n2']);
        });
    });

    describe('assertAccess', () => {
        it('returns the member when no tier is required, without checking subscriptions', async () => {
            const member = { id: 'm1', userId: 'u1', placeId: 'p1', role: 'agente' };
            memberRepo.findOne.mockResolvedValue(member);

            const result = await service.assertAccess('u1', 'p1');

            expect(result).toBe(member);
            expect(subscriptionsService.getSubscriptionForPlace).not.toHaveBeenCalled();
        });

        it('throws when the user has no membership in the place', async () => {
            memberRepo.findOne.mockResolvedValue(null);
            placeRepo.findOne.mockResolvedValue({ id: 'p1', claimedByUserId: 'someone-else' });

            await expect(service.assertAccess('u1', 'p1')).rejects.toThrow(ForbiddenException);
        });

        it("grants access when the place's subscription covers the required tier", async () => {
            memberRepo.findOne.mockResolvedValue({ id: 'm1', userId: 'u1', placeId: 'p1', role: 'admin' });
            subscriptionsService.getSubscriptionForPlace.mockResolvedValue({ status: 'active', tier: 'ia_total' });
            subscriptionsService.hasTierAccess.mockReturnValue(true);

            const result = await service.assertAccess('u1', 'p1', 'ia_total');

            expect(result.role).toBe('admin');
            expect(subscriptionsService.getSubscriptionForPlace).toHaveBeenCalledWith('p1');
        });

        it('throws when the place has no active subscription covering the required tier', async () => {
            memberRepo.findOne.mockResolvedValue({ id: 'm1', userId: 'u1', placeId: 'p1', role: 'admin' });
            subscriptionsService.getSubscriptionForPlace.mockResolvedValue(null);

            await expect(service.assertAccess('u1', 'p1', 'ia_total')).rejects.toThrow(ForbiddenException);
        });

        it('throws when the subscription tier is below what is required', async () => {
            memberRepo.findOne.mockResolvedValue({ id: 'm1', userId: 'u1', placeId: 'p1', role: 'admin' });
            subscriptionsService.getSubscriptionForPlace.mockResolvedValue({ status: 'active', tier: 'reputacion' });
            subscriptionsService.hasTierAccess.mockReturnValue(false);

            await expect(service.assertAccess('u1', 'p1', 'ia_total')).rejects.toThrow(ForbiddenException);
        });
    });
});
