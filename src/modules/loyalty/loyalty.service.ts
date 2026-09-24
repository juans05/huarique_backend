import { Injectable, NotFoundException, BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { In, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { LoyaltyProgram } from './entities/loyalty-program.entity';
import { LoyaltyCard } from './entities/loyalty-card.entity';
import { LoyaltyTransaction } from './entities/loyalty-transaction.entity';
import { Reward } from './entities/reward.entity';
import { WalletCampaign } from './entities/wallet-campaign.entity';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { Place } from '../places/entities/place.entity';

const MAX_WALLET_CAMPAIGNS_PER_DAY = 3;
const WINBACK_INACTIVITY_DAYS = 30;

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    @InjectRepository(LoyaltyProgram) private programRepo: Repository<LoyaltyProgram>,
    @InjectRepository(LoyaltyCard) private cardRepo: Repository<LoyaltyCard>,
    @InjectRepository(LoyaltyTransaction) private txRepo: Repository<LoyaltyTransaction>,
    @InjectRepository(Reward) private rewardRepo: Repository<Reward>,
    @InjectRepository(WalletCampaign) private walletCampaignRepo: Repository<WalletCampaign>,
    @InjectRepository(WhatsAppNumber) private whatsappNumberRepo: Repository<WhatsAppNumber>,
    @InjectRepository(Place) private placesRepo: Repository<Place>,
    @InjectQueue('wallet-campaign') private walletCampaignQueue: Queue,
    private whatsappService: WhatsappService,
  ) {}

  // ── PROGRAMA ────────────────────────────────────────────────────────────

  async getProgram(placeId: string): Promise<LoyaltyProgram | null> {
    return this.programRepo.findOne({ where: { placeId } });
  }

  async upsertProgram(placeId: string, data: Partial<LoyaltyProgram>): Promise<LoyaltyProgram> {
    let program = await this.programRepo.findOne({ where: { placeId } });
    if (!program) {
      program = this.programRepo.create({ placeId, ...data });
    } else {
      Object.assign(program, data);
    }
    return this.programRepo.save(program);
  }

  // ── TARJETA DEL CLIENTE ─────────────────────────────────────────────────

  async getCard(placeId: string, customerPhone: string): Promise<LoyaltyCard | null> {
    return this.cardRepo.findOne({ where: { placeId, customerPhone } });
  }

  async getCardById(cardId: string): Promise<LoyaltyCard> {
    const card = await this.cardRepo.findOne({ where: { id: cardId } });
    if (!card) throw new NotFoundException('Tarjeta no encontrada');
    return card;
  }

  async getCardWithProgram(placeId: string, customerPhone: string) {
    const [program, card] = await Promise.all([
      this.programRepo.findOne({ where: { placeId } }),
      this.cardRepo.findOne({ where: { placeId, customerPhone } }),
    ]);

    if (!program) throw new NotFoundException('Este restaurante no tiene programa de fidelización');

    return {
      program,
      card: card || null,
      isNew: !card,
    };
  }

  // ── ESCANEO — acumular sello/puntos ─────────────────────────────────────

  async scan(placeId: string, customerPhone: string, customerName?: string): Promise<{
    card: LoyaltyCard;
    program: LoyaltyProgram;
    stampsEarned: number;
    pointsEarned: number;
    rewardUnlocked: boolean;
    isNew: boolean;
    blocked?: boolean;
    nextEligibleAt?: Date;
  }> {
    const program = await this.programRepo.findOne({ where: { placeId, isActive: true } });
    if (!program) throw new NotFoundException('Este restaurante no tiene programa de fidelización activo');

    let card = await this.cardRepo.findOne({ where: { placeId, customerPhone } });
    const isNew = !card;

    if (card?.lastVisitAt && program.minHoursBetweenVisits > 0) {
      const nextEligibleAt = new Date(card.lastVisitAt.getTime() + program.minHoursBetweenVisits * 3600_000);
      if (nextEligibleAt > new Date()) {
        return { card, program, stampsEarned: 0, pointsEarned: 0, rewardUnlocked: false, isNew: false, blocked: true, nextEligibleAt };
      }
    }

    if (!card) {
      card = this.cardRepo.create({
        placeId,
        customerPhone,
        customerName: customerName || null,
        stamps: 0,
        points: 0,
        totalVisits: 0,
      });
    }

    if (customerName && !card.customerName) {
      card.customerName = customerName;
    }

    const stampsEarned = program.type === 'stamps' ? 1 : 0;
    const pointsEarned = program.type === 'points' ? program.pointsPerVisit : 0;

    card.stamps += stampsEarned;
    card.points += pointsEarned;
    card.totalVisits += 1;
    card.lastVisitAt = new Date();
    card.level = this.calculateLevel(card.totalVisits);

    const rewardUnlocked =
      program.type === 'stamps' &&
      card.stamps > 0 &&
      card.stamps % program.stampsToReward === 0;

    await this.cardRepo.save(card);

    await this.txRepo.save(this.txRepo.create({
      loyaltyCardId: card.id,
      placeId,
      type: 'earn',
      stamps: stampsEarned,
      points: pointsEarned,
      description: isNew ? 'Primera visita 🎉' : `Visita #${card.totalVisits}`,
    }));

    return { card, program, stampsEarned, pointsEarned, rewardUnlocked, isNew };
  }

  async redeem(cardId: string, rewardId: string): Promise<{ card: LoyaltyCard; reward: Reward }> {
    const card = await this.cardRepo.findOne({ where: { id: cardId } });
    if (!card) throw new NotFoundException('Tarjeta no encontrada');

    const reward = await this.rewardRepo.findOne({ where: { id: rewardId, isActive: true } });
    if (!reward) throw new NotFoundException('Premio no encontrado');

    const program = await this.programRepo.findOne({ where: { placeId: card.placeId } });

    if (program?.type === 'stamps' && card.stamps < reward.stampsCost) {
      throw new BadRequestException(`Necesitas ${reward.stampsCost} sellos. Tienes ${card.stamps}.`);
    }
    if (program?.type === 'points' && card.points < reward.pointsCost) {
      throw new BadRequestException(`Necesitas ${reward.pointsCost} puntos. Tienes ${card.points}.`);
    }

    card.stamps = Math.max(0, card.stamps - reward.stampsCost);
    card.points = Math.max(0, card.points - reward.pointsCost);
    card.totalRedeemed += 1;
    await this.cardRepo.save(card);

    await this.txRepo.save(this.txRepo.create({
      loyaltyCardId: card.id,
      placeId: card.placeId,
      type: 'redeem',
      stamps: reward.stampsCost,
      points: reward.pointsCost,
      description: `Premio canjeado: ${reward.title}`,
    }));

    return { card, reward };
  }

  // ── CALLBACK DE GOOGLE WALLET — guardado/borrado real ────────────────────

  async recordWalletEvent(cardId: string, eventType: 'save' | 'del'): Promise<void> {
    const card = await this.cardRepo.findOne({ where: { id: cardId } });
    if (!card) return;
    if (eventType === 'save') {
      card.googleWalletSavedAt = new Date();
      card.googleWalletDeletedAt = null;
    } else {
      card.googleWalletDeletedAt = new Date();
    }
    await this.cardRepo.save(card);
  }

  // ── CAMPAÑA AUTOMÁTICA POR INACTIVIDAD ───────────────────────────────────
  // Corre una vez al día: si un cliente no vuelve en 30 días, le manda solo
  // el mensaje de reactivación que el dueño configuró — nadie tiene que
  // acordarse de mandarlo a mano. Se marca lastWinbackSentAt para no volver
  // a mandarlo todos los días una vez que ya cruzó el umbral.
  // Hora de Lima: el servidor corre en UTC y a las 10:00 UTC serían las 5:00 en Perú.
  @Cron(CronExpression.EVERY_DAY_AT_10AM, { timeZone: 'America/Lima' })
  async sendInactivityWinbacks(): Promise<void> {
    const programs = await this.programRepo.find({ where: { winbackEnabled: true, isActive: true } });
    if (programs.length === 0) return;

    const cutoff = new Date(Date.now() - WINBACK_INACTIVITY_DAYS * 86400_000);

    for (const program of programs) {
      if (!program.winbackMessage) continue;

      const whatsapp = await this.whatsappNumberRepo.findOne({
        where: { placeId: program.placeId, isActive: true },
      });
      if (!whatsapp) continue;

      const eligibleCards = await this.cardRepo.createQueryBuilder('card')
        .where('card.placeId = :placeId', { placeId: program.placeId })
        .andWhere('card.lastVisitAt < :cutoff', { cutoff })
        .andWhere('(card.lastWinbackSentAt IS NULL OR card.lastWinbackSentAt < :cutoff)', { cutoff })
        .getMany();

      for (const card of eligibleCards) {
        try {
          await this.whatsappService.sendWhatsAppMessage(
            whatsapp.phoneNumberId,
            whatsapp.whatsappApiToken,
            card.customerPhone,
            program.winbackMessage,
          );
          card.lastWinbackSentAt = new Date();
          await this.cardRepo.save(card);
        } catch (err) {
          // No loguear card.customerPhone en texto plano — el id de la tarjeta
          // alcanza para rastrear el error sin dejar PII en los logs.
          this.logger.error(`No se pudo mandar winback (card ${card.id}, place ${program.placeId}): ${err.message}`);
        }
      }
    }
  }

  // ── CAMPAÑA — mensaje a todos los que tienen tarjeta guardada ────────────

  async sendWalletCampaign(placeId: string, header: string, body: string): Promise<{ totalQueued: number }> {
    const since24h = new Date(Date.now() - 24 * 3600_000);
    const sentToday = await this.walletCampaignRepo.count({
      where: { placeId, createdAt: MoreThan(since24h) },
    });
    if (sentToday >= MAX_WALLET_CAMPAIGNS_PER_DAY) {
      throw new BadRequestException(
        `Ya enviaste ${MAX_WALLET_CAMPAIGNS_PER_DAY} campañas en las últimas 24 horas. Google Wallet no notifica más de ${MAX_WALLET_CAMPAIGNS_PER_DAY} veces por tarjeta en ese período — espera antes de enviar otra.`,
      );
    }

    // Solo las tarjetas que siguen guardadas en Google Wallet pueden recibir el aviso.
    const cards = await this.cardRepo.find({ where: this.walletAudience(placeId), select: ['id'] });
    if (cards.length === 0) {
      throw new BadRequestException('Ninguno de tus clientes tiene su tarjeta guardada en Google Wallet todavía.');
    }
    try {
      await this.walletCampaignQueue.addBulk(cards.map((card) => ({
        name: 'send-wallet-message',
        data: { cardId: card.id, header, body },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      })));
    } catch (err) {
      this.logger.error(`No se pudo encolar la campaña de Wallet (place ${placeId}): ${err.message}`);
      throw new ServiceUnavailableException('No se pudo enviar la campaña en este momento. Intenta más tarde.');
    }

    await this.walletCampaignRepo.save(
      this.walletCampaignRepo.create({ placeId, header, body, totalQueued: cards.length }),
    );

    return { totalQueued: cards.length };
  }

  private walletAudience(placeId: string) {
    return { placeId, googleWalletSavedAt: Not(IsNull()), googleWalletDeletedAt: IsNull() };
  }

  /** Lo que el panel necesita saber antes de que el dueño envíe algo. */
  async getNotificationsStatus(placeId: string) {
    const [walletAudience, whatsapp] = await Promise.all([
      this.cardRepo.count({ where: this.walletAudience(placeId) }),
      this.whatsappNumberRepo.findOne({ where: { placeId, isActive: true } }),
    ]);
    return { walletAudience, whatsappConfigured: !!whatsapp };
  }

  // ── CRM — clientes del restaurante ──────────────────────────────────────

  async getClients(placeId: string, page = 1) {
    const size = 20;
    const [data, total] = await this.cardRepo.findAndCount({
      where: { placeId },
      order: { totalVisits: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { data, meta: { total, page, size, totalPages: Math.ceil(total / size) } };
  }

  async getTransactions(cardId: string) {
    return this.txRepo.find({
      where: { loyaltyCardId: cardId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  // ── PREMIOS ──────────────────────────────────────────────────────────────

  async getRewards(placeId: string) {
    return this.rewardRepo.find({ where: { placeId, isActive: true } });
  }

  async upsertReward(placeId: string, rewardId: string | null, data: Partial<Reward>) {
    if (rewardId) {
      await this.rewardRepo.update(rewardId, data);
      return this.rewardRepo.findOne({ where: { id: rewardId } });
    }
    return this.rewardRepo.save(this.rewardRepo.create({ placeId, ...data }));
  }

  async deleteReward(rewardId: string) {
    await this.rewardRepo.update(rewardId, { isActive: false });
  }

  // ── MIS TARJETAS — agregado del cliente en todos los restaurantes ───────
  // El cliente ya no tiene que entrar restaurante por restaurante a ver si
  // tiene sellos ahí: esto junta todas sus tarjetas activas, ordenadas por
  // la más cerca de canjear premio primero.

  async getMyCards(phone: string) {
    if (!phone) return [];

    const cards = await this.cardRepo.find({ where: { customerPhone: phone } });
    if (cards.length === 0) return [];

    const placeIds = cards.map((c) => c.placeId);
    const [programs, places] = await Promise.all([
      this.programRepo.find({ where: { placeId: In(placeIds), isActive: true } }),
      this.placesRepo.find({ where: { id: In(placeIds) } }),
    ]);
    const programByPlace = new Map(programs.map((p) => [p.placeId, p]));
    const placeById = new Map(places.map((p) => [p.id, p]));

    return cards
      .map((card) => {
        const program = programByPlace.get(card.placeId);
        const place = placeById.get(card.placeId);
        if (!program || !place) return null; // programa desactivado o restaurante eliminado

        const stampsRemaining =
          program.type === 'stamps' ? program.stampsToReward - (card.stamps % program.stampsToReward) : null;

        return {
          placeId: place.id,
          placeName: place.name,
          placeCoverImageUrl: place.coverImageUrl,
          latitude: place.latitude,
          longitude: place.longitude,
          programType: program.type,
          stamps: card.stamps,
          points: card.points,
          stampsToReward: program.type === 'stamps' ? program.stampsToReward : null,
          stampsRemaining,
          level: card.level,
          rewardTitle: program.rewardTitle,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => {
        if (a.programType === 'stamps' && b.programType === 'stamps') {
          return (a.stampsRemaining ?? 0) - (b.stampsRemaining ?? 0);
        }
        if (a.programType === 'stamps') return -1;
        if (b.programType === 'stamps') return 1;
        return b.points - a.points;
      });
  }

  private calculateLevel(totalVisits: number): 'BRONCE' | 'PLATA' | 'ORO' | 'VIP' {
    if (totalVisits >= 50) return 'VIP';
    if (totalVisits >= 20) return 'ORO';
    if (totalVisits >= 10) return 'PLATA';
    return 'BRONCE';
  }
}
