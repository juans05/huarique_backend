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

export type SubscriptionTier = 'reputacion' | 'fidelizacion' | 'ia_total';

export const TIER_ORDER: SubscriptionTier[] = ['reputacion', 'fidelizacion', 'ia_total'];

interface TierDefinition {
    tier: SubscriptionTier;
    name: string;
    envPlanIdKey: string;
    envAmountKey: string;
    defaultAmount: number; // centavos
    features: string[];
}

const TIER_DEFINITIONS: TierDefinition[] = [
    {
        tier: 'reputacion',
        name: 'Wuarike Reputación',
        envPlanIdKey: 'CULQI_PLAN_ID_REPUTACION',
        envAmountKey: 'CULQI_PLAN_AMOUNT_REPUTACION',
        defaultAmount: 7900, // S/.79
        features: [
            'Filtro de reputación Google activado',
            'Instagram IA ilimitado',
            'Buzón privado de feedback',
            'Carta digital interactiva',
        ],
    },
    {
        tier: 'fidelizacion',
        name: 'Wuarike Fidelización+',
        envPlanIdKey: 'CULQI_PLAN_ID_FIDELIZACION',
        envAmountKey: 'CULQI_PLAN_AMOUNT_FIDELIZACION',
        defaultAmount: 14900, // S/.149
        features: [
            'Todo lo de Wuarike Reputación',
            'Programa de fidelización con sellos o puntos',
            'Tarjeta digital en Apple Wallet y Google Wallet',
            'Clientes CRM',
        ],
    },
    {
        tier: 'ia_total',
        name: 'Wuarike IA Total',
        envPlanIdKey: 'CULQI_PLAN_ID_IA',
        envAmountKey: 'CULQI_PLAN_AMOUNT_IA',
        defaultAmount: 24900, // S/.249
        features: [
            'Todo lo de Wuarike Fidelización+',
            'PlazBot: bot de WhatsApp con IA',
            'Chat en vivo',
            'Campañas de WhatsApp',
            'Email marketing',
            'Base de conocimiento IA (RAG)',
        ],
    },
];

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

    private tierDefinition(tier: SubscriptionTier): TierDefinition {
        const def = TIER_DEFINITIONS.find((t) => t.tier === tier);
        if (!def) throw new BadRequestException(`Plan "${tier}" no existe`);
        return def;
    }

    private planIdFor(tier: SubscriptionTier) {
        return this.configService.get<string>(this.tierDefinition(tier).envPlanIdKey) || '';
    }

    private planAmountFor(tier: SubscriptionTier) {
        const def = this.tierDefinition(tier);
        return parseInt(this.configService.get<string>(def.envAmountKey) || String(def.defaultAmount));
    }

    /** True if `ownedTier` unlocks features gated at `requiredTier`. */
    hasTierAccess(ownedTier: string, requiredTier: SubscriptionTier): boolean {
        const ownedIndex = TIER_ORDER.indexOf(ownedTier as SubscriptionTier);
        const requiredIndex = TIER_ORDER.indexOf(requiredTier);
        return ownedIndex !== -1 && ownedIndex >= requiredIndex;
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

    async createSubscription(userId: string, token: string, userEmail: string, tier: SubscriptionTier) {
        const existing = await this.subscriptionsRepo.findOne({
            where: { userId, status: 'active' },
        });
        if (existing) {
            throw new ConflictException('Ya tienes una suscripción activa');
        }

        const def = this.tierDefinition(tier);
        const planId = this.planIdFor(tier);
        const planAmount = this.planAmountFor(tier);

        if (!planId) {
            throw new BadRequestException(`El plan "${def.name}" no está configurado. Contacta al administrador.`);
        }

        const culqiSub = await this.culqiRequest('POST', '/subscriptions', {
            plan_id: planId,
            token_id: token,
            tyc: true,
            metadata: { userId, userEmail, tier },
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
                culqiPlanId: planId,
                status: culqiSub.status || 'active',
                tier,
                amount: planAmount,
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
                amount: planAmount,
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

        const byTier = await this.subscriptionsRepo
            .createQueryBuilder('s')
            .select('s.tier', 'tier')
            .addSelect('COUNT(*)', 'count')
            .where('s.status = :s', { s: 'active' })
            .groupBy('s.tier')
            .getRawMany();

        return {
            activeSubscriptions: activeCount,
            canceledSubscriptions: canceledCount,
            activeByTier: byTier.map((r) => ({ tier: r.tier, count: Number(r.count) })),
            totalRevenue: Math.round((Number(totalRevRaw?.total) || 0) / 100),
            monthlyRevenue: Math.round((Number(monthRevRaw?.total) || 0) / 100),
        };
    }

    getPlans() {
        return TIER_DEFINITIONS.map((def) => ({
            tier: def.tier,
            name: def.name,
            price: Math.round(this.planAmountFor(def.tier) / 100),
            currency: 'PEN',
            interval: 'monthly',
            features: def.features,
            configured: !!this.planIdFor(def.tier),
        }));
    }
}
