import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { CreditBalance } from './entities/credit-balance.entity';
import { CreditTransaction } from './entities/credit-transaction.entity';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { PaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class CreditsService {
    private readonly logger = new Logger(CreditsService.name);

    constructor(
        @InjectRepository(CreditBalance)
        private balanceRepo: Repository<CreditBalance>,
        @InjectRepository(CreditTransaction)
        private transactionRepo: Repository<CreditTransaction>,
        @InjectDataSource()
        private dataSource: DataSource,
    ) {}

    async getOrCreateBalance(placeId: string): Promise<CreditBalance> {
        let balance = await this.balanceRepo.findOne({ where: { placeId } });
        if (!balance) {
            balance = this.balanceRepo.create({ placeId });
            balance = await this.balanceRepo.save(balance);
        }
        return balance;
    }

    async getBalance(placeId: string): Promise<CreditBalance> {
        return this.getOrCreateBalance(placeId);
    }

    // deduct() and add() run both writes (balance + transaction record) inside a
    // single DB transaction so the balance can never end up out of sync with its
    // transaction history if the process crashes or a save fails mid-way.
    async deduct(placeId: string, amount: number, referenceType: string, referenceId: string, description?: string): Promise<CreditTransaction> {
        return this.dataSource.transaction(async (manager) => {
            let balance = await manager.findOne(CreditBalance, { where: { placeId } });
            if (!balance) {
                balance = manager.create(CreditBalance, { placeId });
            }

            balance.balance -= amount;
            balance.totalUsed += amount;
            await manager.save(balance);

            const transaction = manager.create(CreditTransaction, {
                placeId,
                type: 'usage',
                amount: -amount,
                balanceAfter: balance.balance,
                referenceType,
                referenceId,
                description: description || `Uso de ${amount} crédito(s)`,
            });
            return manager.save(transaction);
        });
    }

    async add(placeId: string, amount: number, type: 'purchase' | 'bonus' | 'refund', description?: string): Promise<CreditTransaction> {
        return this.dataSource.transaction(async (manager) => {
            let balance = await manager.findOne(CreditBalance, { where: { placeId } });
            if (!balance) {
                balance = manager.create(CreditBalance, { placeId });
            }

            balance.balance += amount;
            if (type === 'purchase') {
                balance.totalPurchased += amount;
            }
            await manager.save(balance);

            const transaction = manager.create(CreditTransaction, {
                placeId,
                type,
                amount: amount,
                balanceAfter: balance.balance,
                description: description || `${type === 'purchase' ? 'Compra' : type === 'bonus' ? 'Bono' : 'Reembolso'} de ${amount} crédito(s)`,
            });
            return manager.save(transaction);
        });
    }

    async getTransactions(query: QueryTransactionDto): Promise<PaginatedResponse<CreditTransaction>> {
        const { page, placeId, type, from, to } = query;
        const size = query.limitOrSize;
        const skip = (page - 1) * size;

        const where: any = { placeId };
        if (type) where.type = type;
        if (from || to) {
            const createdAt: any = {};
            if (from) createdAt.gte = new Date(from);
            if (to) createdAt.lte = new Date(to);
            where.createdAt = createdAt;
        }

        const [data, total] = await this.transactionRepo.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip,
            take: size,
        });

        return {
            data,
            meta: { total, page, size, totalPages: Math.ceil(total / size) },
        };
    }

    async getMonthlyUsage(placeId: string, year: number, month: number): Promise<number> {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59, 999);

        const result = await this.transactionRepo
            .createQueryBuilder('t')
            .select('COALESCE(SUM(t.amount), 0)', 'total')
            .where('t.placeId = :placeId', { placeId })
            .andWhere('t.type = :type', { type: 'usage' })
            .andWhere('t.createdAt BETWEEN :start AND :end', { start, end })
            .getRawOne();

        return Math.abs(Number(result?.total || 0));
    }

    async getTotalUsage(placeId: string, from?: Date, to?: Date): Promise<number> {
        const where: any = { placeId, type: 'usage' };
        if (from || to) {
            const createdAt: any = {};
            if (from) createdAt.gte = from;
            if (to) createdAt.lte = to;
            where.createdAt = createdAt;
        }

        const result = await this.transactionRepo.find({ where });
        return result.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    }
}
