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
import { ContactsService } from '../contacts/contacts.service';

const mockRepo = () => ({ find: jest.fn(), findOne: jest.fn(), update: jest.fn(), save: jest.fn(), create: jest.fn() });

describe('LoyaltyService.getMyCards', () => {
  let service: LoyaltyService;
  let cardRepo: ReturnType<typeof mockRepo>;
  let programRepo: ReturnType<typeof mockRepo>;
  let placesRepo: ReturnType<typeof mockRepo>;
  let contacts: { upsertByPhone: jest.Mock };
  let walletQueue: { add: jest.Mock };
  let rewardRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    contacts = { upsertByPhone: jest.fn().mockResolvedValue(null) };
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
        { provide: ContactsService, useValue: contacts },
      ],
    }).compile();

    service = module.get<LoyaltyService>(LoyaltyService);
    cardRepo = module.get(getRepositoryToken(LoyaltyCard));
    programRepo = module.get(getRepositoryToken(LoyaltyProgram));
    placesRepo = module.get(getRepositoryToken(Place));
    walletQueue = module.get(getQueueToken('wallet-campaign'));
    rewardRepo = module.get(getRepositoryToken(Reward));
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

  describe('redeem: tarjeta y premio del mismo local', () => {
    it('no canjea una tarjeta de otro local', async () => {
      // La búsqueda filtra por placeId: una tarjeta de otro local no aparece.
      cardRepo.findOne.mockImplementation(async ({ where }: any) => (where.placeId === 'B' ? { id: 'c1', placeId: 'B', stamps: 5 } : null));
      await expect(service.redeem('A', 'c1', 'r1')).rejects.toThrow('Tarjeta no encontrada');
      expect(cardRepo.findOne).toHaveBeenCalledWith({ where: { id: 'c1', placeId: 'A' } });
      expect(cardRepo.save).not.toHaveBeenCalled();
    });
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

  describe('scan: espera entre visitas con escaneos simultáneos', () => {
    const program = { placeId: 'p1', type: 'stamps', stampsToReward: 10, minHoursBetweenVisits: 24, pointsPerVisit: 0, isActive: true };
    const oldCard = () => ({ id: 'c1', placeId: 'p1', customerPhone: '999', stamps: 1, points: 0, totalVisits: 1, marketingConsent: true, lastVisitAt: new Date(Date.now() - 48 * 3600_000) });

    it('si otro escaneo ya reservó la visita, este no suma sello', async () => {
      programRepo.findOne.mockResolvedValue(program);
      cardRepo.findOne.mockResolvedValue(oldCard());
      cardRepo.update.mockResolvedValue({ affected: 0 });
      const res = await service.scan('p1', '999');
      expect(res.blocked).toBe(true);
      expect(res.stampsEarned).toBe(0);
      expect(cardRepo.save).not.toHaveBeenCalled();
    });

    it('el escaneo que reserva la visita suma el sello', async () => {
      programRepo.findOne.mockResolvedValue(program);
      cardRepo.findOne.mockResolvedValue(oldCard());
      cardRepo.update.mockResolvedValue({ affected: 1 });
      cardRepo.save.mockImplementation(async (v: any) => v);
      const res = await service.scan('p1', '999');
      expect(res.stampsEarned).toBe(1);
      expect(res.card.stamps).toBe(2);
    });
  });

  describe('scan: cliente único', () => {
    const program = { placeId: 'p1', type: 'stamps', stampsToReward: 10, minHoursBetweenVisits: 0, pointsPerVisit: 0, isActive: true };
    const prep = () => {
      programRepo.findOne.mockResolvedValue(program);
      cardRepo.create.mockImplementation((v: any) => ({ marketingConsent: false, marketingConsentAt: null, ...v }));
      cardRepo.save.mockImplementation(async (v: any) => v);
    };

    it('al crear la tarjeta hace upsert del contacto con el consentimiento de la tarjeta', async () => {
      prep();
      cardRepo.findOne.mockResolvedValue(null);
      await service.scan('p1', '999999999', 'Ana', true);
      expect(contacts.upsertByPhone).toHaveBeenCalledWith('p1', '999999999', { name: 'Ana', source: 'loyalty', marketingConsent: true });
    });

    it('una visita de una tarjeta existente, sin cambio de consentimiento, no toca el contacto', async () => {
      prep();
      cardRepo.findOne.mockResolvedValue({ placeId: 'p1', customerPhone: '999999999', stamps: 1, points: 0, totalVisits: 1, marketingConsent: true, lastVisitAt: null });
      await service.scan('p1', '999999999', 'Ana', true);
      expect(contacts.upsertByPhone).not.toHaveBeenCalled();
    });

    it('una visita con consentimiento sobre una tarjeta existente que no lo tenía lo lleva al contacto (marketingConsent true)', async () => {
      prep();
      cardRepo.findOne.mockResolvedValue({ placeId: 'p1', customerPhone: '999999999', stamps: 1, points: 0, totalVisits: 1, marketingConsent: false, marketingConsentAt: null, lastVisitAt: null });
      await service.scan('p1', '999999999', 'Ana', true);
      expect(contacts.upsertByPhone).toHaveBeenCalledTimes(1);
      expect(contacts.upsertByPhone).toHaveBeenCalledWith('p1', '999999999', { name: 'Ana', source: 'loyalty', marketingConsent: true });
    });

    it('si el contacto falla, la visita se registra igual', async () => {
      prep();
      cardRepo.findOne.mockResolvedValue(null);
      contacts.upsertByPhone.mockRejectedValue(new Error('db caída'));
      const res = await service.scan('p1', '999999999', 'Ana');
      expect(res.isNew).toBe(true);
    });
  });

  describe('sellos completos', () => {
    const program = { placeId: 'p1', type: 'stamps', stampsToReward: 10, minHoursBetweenVisits: 0, pointsPerVisit: 0, isActive: true, rewardTitle: 'Postre gratis' };
    const cardWith = (stamps: number, inWallet = true) => ({
      id: 'c1', placeId: 'p1', customerPhone: '999', stamps, points: 0, totalVisits: stamps, marketingConsent: true, lastVisitAt: null,
      googleWalletSavedAt: inWallet ? new Date() : null, googleWalletDeletedAt: null,
    });
    const myCards = async (stamps: number) => {
      cardRepo.find.mockResolvedValue([{ placeId: 'p1', stamps, points: 0, level: 'BRONCE' }]);
      programRepo.find.mockResolvedValue([program]);
      placesRepo.find.mockResolvedValue([{ id: 'p1', name: 'Don José' }]);
      return (await service.getMyCards('999'))[0].stampsRemaining;
    };

    it('faltan 0 sellos al llegar a la meta o pasarla; tras canjear vuelve a contar', async () => {
      expect(await myCards(10)).toBe(0);
      expect(await myCards(13)).toBe(0);
      expect(await myCards(7)).toBe(3);
      expect(await myCards(0)).toBe(10);
    });

    const scanWith = async (card: ReturnType<typeof cardWith>) => {
      programRepo.findOne.mockResolvedValue(program);
      cardRepo.findOne.mockResolvedValue(card);
      cardRepo.save.mockImplementation(async (v: any) => v);
      placesRepo.findOne.mockResolvedValue({ id: 'p1', name: 'Don José' });
      return service.scan('p1', '999');
    };

    it('el sello que completa la meta avisa a su tarjeta de Google Wallet', async () => {
      const res = await scanWith(cardWith(9));
      expect(res.rewardUnlocked).toBe(true);
      expect(walletQueue.add).toHaveBeenCalledWith(
        'send-wallet-message',
        { cardId: 'c1', header: '¡Completaste tus sellos!', body: 'Ya puedes canjear Postre gratis en Don José.' },
        expect.anything(),
      );
    });

    it('la tarjeta llega hasta la meta y no pasa: con 10/10 la visita cuenta, no suma sello y sigue "para canjear"', async () => {
      const res = await scanWith(cardWith(10));
      expect(res.card.stamps).toBe(10);
      expect(res.stampsEarned).toBe(0);
      expect(res.card.totalVisits).toBe(11);
      expect(res.rewardUnlocked).toBe(true);
      expect(walletQueue.add).not.toHaveBeenCalled(); // ya se le avisó al completar
    });

    it('al canjear el premio de la meta vuelve a 0', async () => {
      cardRepo.findOne.mockResolvedValue(cardWith(10));
      programRepo.findOne.mockResolvedValue(program);
      rewardRepo.findOne.mockResolvedValue({ id: 'r1', placeId: 'p1', stampsCost: 10, pointsCost: 0, isActive: true, title: 'Postre gratis' });
      cardRepo.save.mockImplementation(async (v: any) => v);
      const { card } = await service.redeem('p1', 'c1', 'r1');
      expect(card.stamps).toBe(0);
    });

    it('sin completar la meta, o sin tarjeta en Wallet, no avisa; y si el aviso falla, la visita cuenta igual', async () => {
      await scanWith(cardWith(5));
      await scanWith(cardWith(9, false));
      expect(walletQueue.add).not.toHaveBeenCalled();

      walletQueue.add.mockRejectedValue(new Error('redis caído'));
      await expect(scanWith(cardWith(9))).resolves.toMatchObject({ stampsEarned: 1 });
    });
  });
});
