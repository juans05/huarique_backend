import {
    Injectable,
    BadRequestException,
    NotFoundException,
    ConflictException,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Subscription } from './entities/subscription.entity';
import { Payment } from './entities/payment.entity';

@Injectable()
export class SubscriptionsService {
    private readonly logger = new Logger(SubscriptionsService.name);
    private readonly culqiBaseUrl = 'https://api.culqi.com/v2';

    constructor(
        @InjectRepository(Subscription)
        private subscriptionsRepo: Repository<Subscription>,
        @InjectRepository(Payment)
        private paymentsRepo: Repository<Payment>,
        private configService: ConfigService,
    ) { }

    private get secretKey() {
        return this.configService.get<string>('CULQI_SECRET_KEY') || '';
    }

    private get planId() {
        return this.configService.get<string>('CULQI_PLAN_ID') || '';
    }

    private get planAmount() {
        return parseInt(this.configService.get<string>('CULQI_PLAN_AMOUNT') || '9900');
    }

    private async culqiRequest(method: string, path: string, body?: any) {
        const res = await fetch(`${this.culqiBaseUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json() as any;
        if (!res.ok) {
            const msg = data?.user_message || data?.message || 'Error procesando pago';
            this.logger.error(`Culqi error [${method} ${path}]: ${msg}`, JSON.stringify(data));
            throw new BadRequestException(msg);
        }
        return data;
    }

    async createSubscription(userId: string, token: string, userEmail: string) {
        const existing = await this.subscriptionsRepo.findOne({
            where: { userId, status: 'active' },
        });
        if (existing) {
            throw new ConflictException('Ya tienes una suscripción activa');
        }

        if (!this.planId) {
            throw new BadRequestException('Plan de suscripción no configurado. Contacta al administrador.');
        }

        const culqiSub = await this.culqiRequest('POST', '/subscriptions', {
            plan_id: this.planId,
            token_id: token,
            tyc: true,
            metadata: { userId, userEmail },
        });

        const periodStart = culqiSub.current_period?.period_start
            ? new Date(culqiSub.current_period.period_start * 1000)
            : new Date();
        const periodEnd = culqiSub.current_period?.period_end
            ? new Date(culqiSub.current_period.period_end * 1000)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const sub = await this.subscriptionsRepo.save(
            this.subscriptionsRepo.create({
                userId,
                culqiSubscriptionId: culqiSub.id,
                culqiCustomerId: culqiSub.customer?.id,
                culqiPlanId: this.planId,
                status: culqiSub.status || 'active',
                amount: this.planAmount,
                currency: 'PEN',
                cardLast4: culqiSub.card?.last_four,
                cardBrand: culqiSub.card?.brand,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
            }),
        );

        await this.paymentsRepo.save(
            this.paymentsRepo.create({
                subscriptionId: sub.id,
                userId,
                culqiChargeId: culqiSub.charges?.data?.[0]?.id,
                amount: this.planAmount,
                currency: 'PEN',
                status: 'paid',
                paidAt: new Date(),
            }),
        );

        return sub;
    }

    async getMySubscription(userId: string) {
        return this.subscriptionsRepo.findOne({
            where: { userId },
            order: { createdAt: 'DESC' },
            relations: ['payments'],
        });
    }

    async getMyPayments(userId: string) {
        return this.paymentsRepo.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
    }

    async cancelSubscription(userId: string) {
        const sub = await this.subscriptionsRepo.findOne({
            where: { userId, status: 'active' },
        });
        if (!sub) throw new NotFoundException('No tienes una suscripción activa');

        if (sub.culqiSubscriptionId) {
            await this.culqiRequest('DELETE', `/subscriptions/${sub.culqiSubscriptionId}`).catch((err) =>
                this.logger.warn(`Could not cancel in Culqi: ${err.message}`),
            );
        }

        sub.status = 'canceled';
        sub.canceledAt = new Date();
        return this.subscriptionsRepo.save(sub);
    }

    async getAllSubscriptions(page = 1, limit = 20) {
        const [data, total] = await this.subscriptionsRepo.findAndCount({
            relations: ['user'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async getRevenueStats() {
        const activeCount = await this.subscriptionsRepo.count({ where: { status: 'active' } });
        const canceledCount = await this.subscriptionsRepo.count({ where: { status: 'canceled' } });

        const totalRevRaw = await this.paymentsRepo
            .createQueryBuilder('p')
            .select('SUM(p.amount)', 'total')
            .where('p.status = :s', { s: 'paid' })
            .getRawOne();

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthRevRaw = await this.paymentsRepo
            .createQueryBuilder('p')
            .select('SUM(p.amount)', 'total')
            .where('p.status = :s', { s: 'paid' })
            .andWhere('p.created_at >= :start', { start: monthStart })
            .getRawOne();

        return {
            activeSubscriptions: activeCount,
            canceledSubscriptions: canceledCount,
            totalRevenue: Math.round((Number(totalRevRaw?.total) || 0) / 100),
            monthlyRevenue: Math.round((Number(monthRevRaw?.total) || 0) / 100),
            planAmount: Math.round(this.planAmount / 100),
        };
    }

    getPlanInfo() {
        return {
            name: 'Warike Pro',
            price: Math.round(this.planAmount / 100),
            currency: 'PEN',
            interval: 'monthly',
            features: [
                'Filtro de reputación Google activado',
                'Instagram IA ilimitado',
                'Buzón privado de feedback',
                'Carta digital interactiva',
                'Analytics avanzados',
                'Soporte prioritario',
            ],
        };
    }
}
