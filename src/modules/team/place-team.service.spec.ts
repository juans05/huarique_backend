import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlaceTeamService } from './place-team.service';
import { PlaceTeamMember } from './entities/place-team-member.entity';
import { TeamMemberWhatsappAccess } from './entities/team-member-whatsapp-access.entity';
import { Place } from '../places/entities/place.entity';

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

describe('PlaceTeamService', () => {
    let service: PlaceTeamService;
    let memberRepo: ReturnType<typeof mockMemberRepo>;
    let placeRepo: ReturnType<typeof mockPlaceRepo>;
    let accessRepo: ReturnType<typeof mockAccessRepo>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PlaceTeamService,
                { provide: getRepositoryToken(PlaceTeamMember), useFactory: mockMemberRepo },
                { provide: getRepositoryToken(TeamMemberWhatsappAccess), useFactory: mockAccessRepo },
                { provide: getRepositoryToken(Place), useFactory: mockPlaceRepo },
            ],
        }).compile();

        service = module.get(PlaceTeamService);
        memberRepo = module.get(getRepositoryToken(PlaceTeamMember));
        placeRepo = module.get(getRepositoryToken(Place));
        accessRepo = module.get(getRepositoryToken(TeamMemberWhatsappAccess));
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
});
