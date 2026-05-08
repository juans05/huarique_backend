import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoyaltyProgram } from './entities/loyalty-program.entity';
import { LoyaltyCard } from './entities/loyalty-card.entity';
import { LoyaltyTransaction } from './entities/loyalty-transaction.entity';
import { Reward } from './entities/reward.entity';

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectRepository(LoyaltyProgram) private programRepo: Repository<LoyaltyProgram>,
    @InjectRepository(LoyaltyCard) private cardRepo: Repository<LoyaltyCard>,
    @InjectRepository(LoyaltyTransaction) private txRepo: Repository<LoyaltyTransaction>,
    @InjectRepository(Reward) private rewardRepo: Repository<Reward>,
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
  }> {
    const program = await this.programRepo.findOne({ where: { placeId, isActive: true } });
    if (!program) throw new NotFoundException('Este restaurante no tiene programa de fidelización activo');

    let card = await this.cardRepo.findOne({ where: { placeId, customerPhone } });
    const isNew = !card;

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

  private calculateLevel(totalVisits: number): 'BRONCE' | 'PLATA' | 'ORO' | 'VIP' {
    if (totalVisits >= 50) return 'VIP';
    if (totalVisits >= 20) return 'ORO';
    if (totalVisits >= 10) return 'PLATA';
    return 'BRONCE';
  }
}
