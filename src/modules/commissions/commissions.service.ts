import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, IsNull, LessThan, Repository } from 'typeorm';
import { CommissionSettings } from './entities/commission-settings.entity';
import { CommissionEntry } from './entities/commission-entry.entity';
import { CommissionPayout } from './entities/commission-payout.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Payment } from '../subscriptions/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
    CommissionLine,
    CommissionSettingsValues,
    DEFAULT_COMMISSION_SETTINGS,
    clawbackFor,
    commissionForPayment,
    periodEnd,
    validateSettings,
} from './commission-rules.util';

const isUniqueViolation = (err: any) => err?.code === '23505';

@Injectable()
export class CommissionsService {
    private readonly logger = new Logger(CommissionsService.name);

    constructor(
        @InjectRepository(CommissionSettings) private settingsRepo: Repository<CommissionSettings>,
        @InjectRepository(CommissionEntry) private entriesRepo: Repository<CommissionEntry>,
        @InjectRepository(CommissionPayout) private payoutsRepo: Repository<CommissionPayout>,
        @InjectRepository(Subscription) private subscriptionsRepo: Repository<Subscription>,
        @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
        @InjectRepository(User) private usersRepo: Repository<User>,
        private auditLog: AuditLogService,
        private dataSource: DataSource,
    ) {}

    // --- Configuración ---

    async getSettings(): Promise<CommissionSettingsValues & { updatedAt: Date | null; updatedByUserId: string | null }> {
        const row = await this.settingsRepo.findOne({ where: { id: 1 } });
        if (!row) return { ...DEFAULT_COMMISSION_SETTINGS, updatedAt: null, updatedByUserId: null };
        return {
            firstMonthRate: row.firstMonthRate,
            recurringRate: row.recurringRate,
            recurringMonths: row.recurringMonths,
            clawbackDays: row.clawbackDays,
            updatedAt: row.updatedAt,
            updatedByUserId: row.updatedByUserId,
        };
    }

    async updateSettings(patch: Partial<CommissionSettingsValues>, adminId: string) {
        const clean: Partial<CommissionSettingsValues> = {};
        for (const k of ['firstMonthRate', 'recurringRate', 'recurringMonths', 'clawbackDays'] as const) {
            const v: unknown = typeof patch[k] === 'string' ? (patch[k] as string).trim() : patch[k];
            if (v === undefined || v === null || v === '') continue; // Number(null) === 0 bajaría la tasa a 0 sin avisar
            const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
            if (!Number.isFinite(n)) throw new BadRequestException(`Valor inválido para ${k}`);
            clean[k] = n;
        }
        const error = validateSettings(clean);
        if (error) throw new BadRequestException(error);

        const before = await this.getSettings();
        const after = { ...before, ...clean };
        await this.settingsRepo.save({
            id: 1,
            firstMonthRate: after.firstMonthRate,
            recurringRate: after.recurringRate,
            recurringMonths: after.recurringMonths,
            clawbackDays: after.clawbackDays,
            updatedAt: new Date(),
            updatedByUserId: adminId,
        });
        await this.auditLog.log({
            action: 'commission_settings.updated',
            entityType: 'commission_settings',
            entityId: '1',
            userId: adminId,
            metadata: { before, after: clean },
            description: 'Configuración de comisiones actualizada',
        });
        return { ...after, updatedAt: new Date(), updatedByUserId: adminId };
    }

    // --- Generación de comisiones ---

    @OnEvent('subscription.payment.recorded', { async: true })
    async onPaymentRecorded(e: { subscriptionId: string; paymentId: string }) {
        // Un fallo de comisiones nunca debe romper el registro del pago.
        await this.recordForPayment(e.subscriptionId, e.paymentId).catch((err) =>
            this.logger.error(`Comisión del pago ${e.paymentId}: ${err.message}`),
        );
    }

    @OnEvent('subscription.canceled', { async: true })
    async onSubscriptionCanceled(e: { subscriptionId: string; canceledAt: Date }) {
        await this.recordClawbackIfNeeded(e.subscriptionId, new Date(e.canceledAt)).catch((err) =>
            this.logger.error(`Descuento de la suscripción ${e.subscriptionId}: ${err.message}`),
        );
    }

    async recordForPayment(subscriptionId: string, paymentId: string): Promise<CommissionEntry | null> {
        const sub = await this.subscriptionsRepo.findOne({ where: { id: subscriptionId } });
        if (!sub?.salesUserId) return null;
        const seller = await this.usersRepo.findOne({ where: { id: sub.salesUserId } });
        if (seller?.role !== 'sales') return null;

        const payments = await this.paymentsRepo.find({
            where: { subscriptionId, status: 'paid' },
            order: { paidAt: 'ASC', createdAt: 'ASC', id: 'ASC' },
        });
        const index = payments.findIndex((p) => p.id === paymentId);
        if (index === -1) return null;
        const base = payments[index].amount;
        const line = commissionForPayment(index + 1, base, await this.getSettings());
        if (!line) return null;
        return this.saveLine(sub.salesUserId, sub.placeId, subscriptionId, paymentId, base, line);
    }

    async recordClawbackIfNeeded(subscriptionId: string, canceledAt: Date): Promise<CommissionEntry | null> {
        const first = await this.entriesRepo.findOne({ where: { subscriptionId, type: 'first_month' } });
        if (!first) return null;
        const payment = await this.paymentsRepo.findOne({ where: { id: first.paymentId } });
        const line = clawbackFor(first, payment?.paidAt ?? null, canceledAt, await this.getSettings());
        if (!line) return null;
        return this.saveLine(first.salesUserId, first.placeId, subscriptionId, first.paymentId, first.baseAmount, line);
    }

    private async saveLine(salesUserId: string, placeId: string, subscriptionId: string, paymentId: string, baseAmount: number, line: CommissionLine) {
        try {
            return await this.entriesRepo.save(
                this.entriesRepo.create({ salesUserId, placeId, subscriptionId, paymentId, baseAmount, ...line }),
            );
        } catch (err) {
            if (isUniqueViolation(err)) return null; // ya registrada (webhook + revisión diaria a la vez)
            throw err;
        }
    }

    // --- Liquidaciones ---

    async generatePayouts(period: string): Promise<CommissionPayout[]> {
        let end: Date;
        try {
            end = periodEnd(period);
        } catch (err) {
            throw new BadRequestException(err.message);
        }
        const sellers: { salesUserId: string }[] = await this.entriesRepo
            .createQueryBuilder('e')
            .select('DISTINCT e.sales_user_id', 'salesUserId')
            .where('e.payout_id IS NULL')
            .andWhere('e.created_at < :end', { end })
            .getRawMany();

        const created: CommissionPayout[] = [];
        for (const { salesUserId } of sellers) {
            const payout = await this.dataSource.transaction(async (manager) => {
                // Bloquea las líneas para que otra generación simultánea no las tome también.
                const lines = await manager.find(CommissionEntry, {
                    where: { salesUserId, payoutId: IsNull(), createdAt: LessThan(end) },
                    lock: { mode: 'pessimistic_write' },
                });
                const total = lines.reduce((s, l) => s + l.amount, 0);
                if (total <= 0) return null; // se acumulan para el siguiente cierre
                const saved = await manager.save(
                    CommissionPayout,
                    manager.create(CommissionPayout, { salesUserId, period, totalAmount: total, status: 'pending' }),
                );
                await manager.update(CommissionEntry, lines.map((l) => l.id), { payoutId: saved.id });
                return saved;
            });
            if (payout) created.push(payout);
        }
        return created;
    }

    async listPayouts(filter: { period?: string; salesUserId?: string }) {
        const where: any = {};
        if (filter.period) where.period = filter.period;
        if (filter.salesUserId) where.salesUserId = filter.salesUserId;
        const rows = await this.payoutsRepo.find({ where, relations: ['salesUser'], order: { createdAt: 'DESC' } });
        return rows.map(({ salesUser, ...p }) => ({ ...p, salesUserName: salesUser?.fullName ?? '' }));
    }

    async getPayout(id: string, salesUserId?: string) {
        const row = await this.payoutsRepo.findOne({ where: { id }, relations: ['salesUser'] });
        if (!row || (salesUserId && row.salesUserId !== salesUserId)) throw new NotFoundException('Liquidación no encontrada');
        const { salesUser, ...rest } = row;
        const payout = { ...rest, salesUserName: salesUser?.fullName ?? '' };
        const entries = await this.entriesRepo.find({ where: { payoutId: id }, relations: ['place'], order: { createdAt: 'ASC' } });
        return { payout, entries: entries.map(({ place, ...e }) => ({ ...e, placeName: place?.name ?? '' })) };
    }

    async markPaid(id: string, adminId: string, note?: string) {
        const payout = await this.payoutsRepo.findOne({ where: { id } });
        if (!payout) throw new NotFoundException('Liquidación no encontrada');
        if (payout.status === 'paid') throw new BadRequestException('Esta liquidación ya está pagada.');
        return this.payoutsRepo.save({ ...payout, status: 'paid', paidAt: new Date(), paidByUserId: adminId, note: note?.trim() || null });
    }

    async cancelPayout(id: string) {
        const payout = await this.payoutsRepo.findOne({ where: { id } });
        if (!payout) throw new NotFoundException('Liquidación no encontrada');
        if (payout.status === 'paid') throw new BadRequestException('Esta liquidación ya está pagada: no se puede anular.');
        await this.payoutsRepo.delete(id); // ON DELETE SET NULL libera sus líneas
    }

    async listEntries(salesUserId: string) {
        const entries = await this.entriesRepo.find({ where: { salesUserId }, relations: ['place'], order: { createdAt: 'DESC' } });
        const pendingTotal = entries.filter((e) => e.payoutId === null).reduce((s, e) => s + e.amount, 0);
        return { pendingTotal, entries: entries.map(({ place, ...e }) => ({ ...e, placeName: place?.name ?? '' })) };
    }
}
