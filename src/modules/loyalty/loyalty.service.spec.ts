import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyProgram } from './entities/loyalty-program.entity';
import { LoyaltyCard } from './entities/loyalty-card.entity';
import { LoyaltyTransaction } from './entities/loyalty-transaction.entity';
import { Reward } from './entities/reward.entity';
import { WalletCampaign } from './entities/wallet-campaign.entity';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { Place } from '../places/entities/place.entity';

const mockRepo = () => ({ find: jest.fn(), findOne: jest.fn(), update: jest.fn(), save: jest.fn(), create: jest.fn() });

describe('LoyaltyService.getMyCards', () => {
  let service: LoyaltyService;
  let cardRepo: ReturnType<typeof mockRepo>;
  let programRepo: ReturnType<typeof mockRepo>;
  let placesRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoyaltyService,
        { provide: getRepositoryToken(LoyaltyProgram), useFactory: mockRepo },
        { provide: getRepositoryToken(LoyaltyCard), useFactory: mockRepo },
        { provide: getRepositoryToken(LoyaltyTransaction), useFactory: mockRepo },
        { provide: getRepositoryToken(Reward), useFactory: mockRepo },
        { provide: getRepositoryToken(WalletCampaign), useFactory: mockRepo },
        { provide: getRepositoryToken(WhatsAppNumber), useFactory: mockRepo },
        { provide: getRepositoryToken(Place), useFactory: mockRepo },
        { provide: getQueueToken('wallet-campaign'), useValue: { add: jest.fn() } },
        { provide: WhatsappService, useValue: {} },
      ],
    }).compile();

    service = module.get<LoyaltyService>(LoyaltyService);
    cardRepo = module.get(getRepositoryToken(LoyaltyCard));
    programRepo = module.get(getRepositoryToken(LoyaltyProgram));
    placesRepo = module.get(getRepositoryToken(Place));
  });

  it('includes latitude/longitude from the place in each card', async () => {
    cardRepo.find.mockResolvedValue([
      { placeId: 'place-1', stamps: 3, points: 0, level: 'BRONCE' },
    ]);
    programRepo.find.mockResolvedValue([
      { placeId: 'place-1', type: 'stamps', stampsToReward: 10, rewardTitle: 'Postre gratis', isActive: true },
    ]);
    placesRepo.find.mockResolvedValue([
      { id: 'place-1', name: 'Wuarike Don José', coverImageUrl: null, latitude: -12.046, longitude: -77.042 },
    ]);

    const result = await service.getMyCards('+51999999999');

    expect(result[0].latitude).toBe(-12.046);
    expect(result[0].longitude).toBe(-77.042);
  });
});
