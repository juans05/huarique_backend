import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OrderPayment } from './entities/order-payment.entity';
import { PlacePayout } from './entities/place-payout.entity';
import { PlaceOrderSettings } from './entities/place-order-settings.entity';
import { limaMonthRange, limaPeriod } from './lima-period';

@Injectable()
export class PayoutsService {
    constructor(
        @InjectRepository(OrderPayment) private paymentsRepo: Repository<OrderPayment>,
        @InjectRepository(PlacePayout) private payoutsRepo: Repository<PlacePayout>,
        @InjectRepository(PlaceOrderSettings) private settingsRepo: Repository<PlaceOrderSettings>,
    ) { }

    // 06:00 Lima = 11:00 UTC del día 1: liquida el mes anterior.
    @Cron('0 11 1 * *')
    async monthly() {
        await this.generate(limaPeriod(new Date(Date.now() - 24 * 3600_000)));
    }

    /** Solo toma pagos online a Wuarikes que aún no están en otra liquidación: correrlo dos veces no duplica. */
    async generate(period: string): Promise<PlacePayout[]> {
        const { start, end } = limaMonthRange(period);
        const payments = await this.paymentsRepo.createQueryBuilder('p')
            .where('p.destination = :d AND p.status = :s', { d: 'WUARIKES', s: 'PAGADO' })
            .andWhere('p.payout_id IS NULL')
            .andWhere('p.paid_at >= :start AND p.paid_at < :end', { start, end })
            .getMany();
        const byPlace = new Map<string, OrderPayment[]>();
        payments.forEach((p) => byPlace.set(p.placeId, [...(byPlace.get(p.placeId) ?? []), p]));

        const created: PlacePayout[] = [];
        for (const [placeId, rows] of byPlace) {
            const settings = await this.settingsRepo.findOne({ where: { placeId } });
            const gross = rows.reduce((s, p) => s + p.amount, 0);
            const commission = Math.round(gross * (settings?.wuarikesCommissionPct ?? 0.05));
            const culqiFees = rows.reduce((s, p) => s + p.culqiFee, 0);
            const payout = await this.payoutsRepo.save(this.payoutsRepo.create({ placeId, period, gross, commission, culqiFees, net: gross - commission - culqiFees, status: 'BORRADOR' }));
            await this.paymentsRepo.update({ id: In(rows.map((r) => r.id)) }, { payoutId: payout.id });
            created.push(payout);
        }
        return created;
    }

    list(period?: string) {
        return this.payoutsRepo.find({ where: period ? { period } : {}, order: { createdAt: 'DESC' } });
    }

    async markPaid(id: string, reference: string) {
        const payout = await this.payoutsRepo.findOne({ where: { id } });
        if (!payout) throw new NotFoundException('Liquidación no encontrada');
        return this.payoutsRepo.save({ ...payout, status: 'PAGADO', paidAt: new Date(), reference });
    }

    async setCommission(placeId: string, pct: number) {
        const settings = (await this.settingsRepo.findOne({ where: { placeId } })) ?? this.settingsRepo.create({ placeId });
        return this.settingsRepo.save({ ...settings, wuarikesCommissionPct: pct });
    }
}
