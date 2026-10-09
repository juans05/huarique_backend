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

  describe('scan: consentimiento de promociones', () => {
    const program = { placeId: 'p1', type: 'stamps', stampsToReward: 10, minHoursBetweenVisits: 0, pointsPerVisit: 0, isActive: true };
    const prep = () => {
      programRepo.findOne.mockResolvedValue(program);
      cardRepo.create.mockImplementation((v: any) => ({ marketingConsent: false, marketingConsentAt: null, ...v }));
      cardRepo.save.mockImplementation(async (v: any) => v);
      // el resto de repos (transacciones, wallet) se simulan solos con mockRepo
    };

    it('al unirse con el check marcado guarda el consentimiento y su fecha', async () => {
      prep();
      cardRepo.findOne.mockResolvedValue(null);
      const res: any = await service.scan('p1', '51999999999', 'Ana', true).catch(() => null);
      const saved = cardRepo.save.mock.calls[0]?.[0];
      expect(saved?.marketingConsent ?? res?.card?.marketingConsent).toBe(true);
      expect((saved ?? res?.card).marketingConsentAt).toBeInstanceOf(Date);
    });

    it('sin marcar, no acepta; y una visita posterior sin el check NO revoca lo aceptado', async () => {
      prep();
      cardRepo.findOne.mockResolvedValue(null);
      await service.scan('p1', '51999999999', 'Ana').catch(() => null);
      expect(cardRepo.save.mock.calls[0][0].marketingConsent).toBe(false);

      cardRepo.save.mockClear();
      cardRepo.findOne.mockResolvedValue({ placeId: 'p1', customerPhone: '51999999999', stamps: 1, points: 0, totalVisits: 1, marketingConsent: true, marketingConsentAt: new Date('2026-01-01'), lastVisitAt: null });
      await service.scan('p1', '51999999999', 'Ana', false).catch(() => null);
      expect(cardRepo.save.mock.calls[0][0].marketingConsent).toBe(true);
    });
  });
});
