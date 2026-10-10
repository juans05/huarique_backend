import {
    Injectable,
    BadRequestException,
    NotFoundException,
    ConflictException,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Subscription } from './entities/subscription.entity';
import { CULQI_STATUS, decideSync, splitFullName } from './culqi-sync.util';
import { User } from '../users/entities/user.entity';
import { Payment } from './entities/payment.entity';
import { Place } from '../places/entities/place.entity';

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
        defaultAmount: 7999, // S/.79.99
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
        defaultAmount: 19900, // S/.199
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
        defaultAmount: 49900, // S/.499
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
        @InjectRepository(Place)
        private placesRepo: Repository<Place>,
        @InjectRepository(User)
        private usersRepo: Repository<User>,
        private configService: ConfigService,
        private eventEmitter: EventEmitter2,
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

    async createSubscription(placeId: string, userId: string, token: string, userEmail: string, tier: SubscriptionTier) {
        const existing = await this.subscriptionsRepo.findOne({
            where: { placeId, status: In(['active', 'pending']) },
        });
        if (existing) {
            throw new ConflictException('Esta sede ya tiene una suscripción activa');
        }

        // Si quedó una con pago pendiente, se cancela en Culqi antes de crear la nueva: si no,
        // Culqi seguiría reintentando el cobro viejo y el local pagaría dos veces.
        const pastDue = await this.subscriptionsRepo.find({ where: { placeId, status: 'past_due' } });
        // Si no se puede cancelar la vieja en Culqi, no se crea la nueva (lanza error).
        for (const old of pastDue) await this.cancelInCulqiThenLocally(old);

        const def = this.tierDefinition(tier);
        const planId = this.planIdFor(tier);
        const planAmount = this.planAmountFor(tier);

        if (!planId) {
            throw new BadRequestException(`El plan "${def.name}" no está configurado. Contacta al administrador.`);
        }

        // Flujo actual de Culqi (apidocs.culqi.com): cliente → tarjeta (con el token) → suscripción (con la tarjeta).
        const customerId = await this.findOrCreateCulqiCustomer(placeId, userId, userEmail);
        const card = await this.culqiRequest('POST', '/cards', { customer_id: customerId, token_id: token });
        if (card.action_code === 'REVIEW' || !card.id) {
            // ponytail: sin flujo 3DS en el checkout; si el banco lo exige, se pide otra tarjeta.
            throw new BadRequestException(card.user_message || 'Tu banco pidió una verificación adicional. Prueba con otra tarjeta.');
        }
        const created = await this.culqiRequest('POST', '/recurrent/subscriptions/create', {
            card_id: card.id,
            plan_id: planId,
            tyc: true,
            metadata: { userId, placeId, tier },
        });
        // La respuesta de crear no trae fechas ni cargos: se consulta la suscripción.
        const culqiSub = await this.culqiRequest('GET', `/recurrent/subscriptions/${created.id}`).catch(() => ({}) as any);
        const firstChargeId: string | undefined = culqiSub.periods?.charges?.charge_id;
        const nextBilling = culqiSub.next_billing_date ? new Date(culqiSub.next_billing_date * 1000) : null;

        // El acceso solo se da con el primer cargo confirmado en Culqi (exitoso y por el monto del plan).
        // Si todavía no sale, queda "pending" hasta hoy y la sincronización lo activa cuando Culqi cobre
        // (o lo pasa a pago pendiente si no cobra en el plazo).
        const firstPaid = !!firstChargeId && (await this.isChargePaid(firstChargeId, planAmount));
        const periodStart = new Date();
        const periodEnd = firstPaid && nextBilling ? nextBilling : periodStart;

        const place = await this.placesRepo.findOne({ where: { id: placeId } });

        let sub: Subscription;
        try {
            sub = await this.subscriptionsRepo.save(
                this.subscriptionsRepo.create({
                    placeId,
                    userId,
                    culqiSubscriptionId: created.id,
                    culqiCustomerId: customerId,
                    culqiPlanId: planId,
                    status: firstPaid ? 'active' : 'pending',
                    tier,
                    amount: planAmount,
                    currency: 'PEN',
                    cardLast4: card.source?.last_four,
                    cardBrand: card.source?.iin?.card_brand,
                    currentPeriodStart: periodStart,
                    currentPeriodEnd: periodEnd,
                    salesUserId: place?.assignedSalesUserId ?? null,
                }),
            );
        } catch (error) {
            // El índice único parcial (place_id WHERE status='active') es el backstop real
            // contra una carrera de dos "Suscribirme" simultáneos — el chequeo de arriba
            // solo evita el caso común. Si la DB lo rechaza, devolvemos el mismo 409 en vez
            // de un 500 crudo.
            this.logger.error(`Error saving subscription for place ${placeId}: ${error.message}`);
            throw new ConflictException('Esta sede ya tiene una suscripción activa');
        }

        if (firstPaid) {
            const payment = await this.paymentsRepo.save(
                this.paymentsRepo.create({
                    subscriptionId: sub.id,
                    userId,
                    culqiChargeId: firstChargeId,
                    amount: planAmount,
                    currency: 'PEN',
                    status: 'paid',
                    paidAt: new Date(),
                }),
            );
            this.eventEmitter.emit('subscription.payment.recorded', { subscriptionId: sub.id, paymentId: payment.id });
        }

        return sub;
    }

    /** Culqi exige nombre, dirección y teléfono del cliente; se reusa si ya existe con ese correo. */
    private async findOrCreateCulqiCustomer(placeId: string, userId: string, email: string): Promise<string> {
        const found = await this.culqiRequest('GET', `/customers?email=${encodeURIComponent(email)}`).catch(() => null);
        const existingId = found?.data?.[0]?.id;
        if (existingId) return existingId;

        const [user, place] = await Promise.all([
            this.usersRepo.findOne({ where: { id: userId } }),
            this.placesRepo.findOne({ where: { id: placeId } }),
        ]);
        const phone = (user?.phone || place?.phone || '').replace(/\D/g, '').slice(-9);
        if (phone.length < 9) {
            throw new BadRequestException('Para suscribirte necesitamos un teléfono de 9 dígitos: agrégalo en Mi cuenta o en los datos del local.');
        }
        const { firstName, lastName } = splitFullName(user?.fullName, place?.name || 'Cliente');
        const customer = await this.culqiRequest('POST', '/customers', {
            first_name: firstName,
            last_name: lastName,
            email,
            address: place?.address || 'Lima',
            address_city: 'Lima',
            country_code: 'PE',
            phone_number: phone,
        });
        return customer.id;
    }

    /** El plan de una SEDE — todo el equipo de esa sede lo hereda por igual. */
    async getSubscriptionForPlace(placeId: string) {
        return this.subscriptionsRepo.findOne({
            where: { placeId },
            order: { createdAt: 'DESC' },
            relations: ['payments'],
        });
    }

    /**
     * Solo para PlazBot Setup: templates/campañas del workspace compartido no son
     * por sede, así que se gatean por "¿el usuario dueño de al menos una sede con
     * el plan pedido?" en vez de por una sede puntual.
     */
    async hasAnyPlaceWithTier(userId: string, requiredTier: SubscriptionTier): Promise<boolean> {
        const ownedPlaces = await this.placesRepo.find({ where: { claimedByUserId: userId } });
        if (ownedPlaces.length === 0) return false;

        const subs = await this.subscriptionsRepo.find({
            where: { placeId: In(ownedPlaces.map((p) => p.id)), status: 'active' },
        });
        return subs.some((s) => this.hasTierAccess(s.tier, requiredTier));
    }

    async getPaymentsForPlace(placeId: string) {
        return this.paymentsRepo.find({
            where: { subscription: { placeId } },
            order: { createdAt: 'DESC' },
        });
    }

    async cancelSubscription(placeId: string) {
        // pending y past_due también se cobran en Culqi: el dueño tiene que poder cancelarlas.
        const sub = await this.subscriptionsRepo.findOne({
            where: { placeId, status: In(['active', 'pending', 'past_due']) },
        });
        if (!sub) throw new NotFoundException('Esta sede no tiene una suscripción activa');
        return this.cancelInCulqiThenLocally(sub);
    }

    /** Cancela primero en Culqi; si Culqi no confirma, no se marca cancelada (si no, seguiría cobrando). */
    private async cancelInCulqiThenLocally(sub: Subscription) {
        if (sub.culqiSubscriptionId) {
            try {
                await this.culqiRequest('DELETE', `/recurrent/subscriptions/${sub.culqiSubscriptionId}`);
            } catch (err) {
                // Ya cancelada en Culqi: está bien marcarla. Cualquier otro error: no se toca y se avisa.
                const remote = await this.culqiRequest('GET', `/recurrent/subscriptions/${sub.culqiSubscriptionId}`).catch(() => null);
                if (remote?.status !== CULQI_STATUS.CANCELED) {
                    this.logger.error(`Could not cancel ${sub.id} in Culqi: ${err.message}`);
                    throw new BadRequestException('No pudimos cancelar el cobro en Culqi. Intenta de nuevo en unos minutos.');
                }
            }
        }
        sub.status = 'canceled';
        sub.canceledAt = new Date();
        const saved = await this.subscriptionsRepo.save(sub);
        this.eventEmitter.emit('subscription.canceled', { subscriptionId: sub.id, canceledAt: sub.canceledAt });
        return saved;
    }

    async getAllSubscriptions(page = 1, limit = 20) {
        const [data, total] = await this.subscriptionsRepo.findAndCount({
            relations: ['user', 'place'],
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

    // --- Sincronización con Culqi (webhook + revisión diaria) ---
    // El aviso de Culqi no se usa como dato: solo dispara una consulta a Culqi con la llave secreta.
    // Así un aviso falso no puede activar ni extender ningún plan; a lo más adelanta una revisión.
    private lastWebhookSyncAt = 0;
    private syncing = false;

    handleCulqiWebhook() {
        // ponytail: una revisión por minuto como máximo; si llegan muchos avisos, la diaria cubre lo que falte.
        if (Date.now() - this.lastWebhookSyncAt < 60_000) return;
        this.lastWebhookSyncAt = Date.now();
        this.syncAllWithCulqi().catch((err) => this.logger.error(`Culqi sync failed: ${err.message}`));
    }

    @Cron(CronExpression.EVERY_DAY_AT_6AM)
    async syncAllWithCulqi() {
        if (this.syncing || !this.secretKey) return;
        this.syncing = true;
        try {
            const subs = await this.subscriptionsRepo.find({ where: { status: In(['active', 'pending', 'past_due']) } });
            for (const sub of subs) {
                if (!sub.culqiSubscriptionId) continue;
                try {
                    await this.syncOneWithCulqi(sub);
                } catch (err) {
                    this.logger.warn(`Culqi sync ${sub.id}: ${err.message}`);
                }
            }
        } finally {
            this.syncing = false;
        }
    }

    /** True solo si Culqi confirma que el cargo se cobró por el monto esperado (en céntimos, PEN). */
    private async isChargePaid(chargeId: string, expectedAmount: number): Promise<boolean> {
        const charge = await this.culqiRequest('GET', `/charges/${chargeId}`).catch(() => null);
        return charge?.outcome?.type === 'venta_exitosa' && Number(charge.amount) === expectedAmount && (charge.currency_code || 'PEN') === 'PEN';
    }

    private async syncOneWithCulqi(sub: Subscription) {
        const remote = await this.culqiRequest('GET', `/recurrent/subscriptions/${sub.culqiSubscriptionId}`);
        const action = decideSync(sub, remote);
        if (action.kind === 'none') return;

        if (action.kind === 'renewed') {
            // Se confirma el cargo en Culqi: exitoso y por el monto del plan. Si no, no se da acceso.
            if (!(await this.isChargePaid(action.chargeId, sub.amount))) {
                this.logger.warn(`Culqi: cargo ${action.chargeId} de ${sub.id} no confirmado como pagado`);
                return;
            }
            const alreadyRecorded = await this.paymentsRepo.exists({ where: { culqiChargeId: action.chargeId } });
            sub.status = 'active';
            sub.currentPeriodStart = action.periodStart;
            sub.currentPeriodEnd = action.periodEnd;
            await this.subscriptionsRepo.save(sub);
            if (!alreadyRecorded) {
                const payment = await this.paymentsRepo.save(
                    this.paymentsRepo.create({
                        subscriptionId: sub.id,
                        userId: sub.userId,
                        culqiChargeId: action.chargeId,
                        amount: sub.amount,
                        currency: sub.currency || 'PEN',
                        status: 'paid',
                        paidAt: action.periodStart,
                    }),
                );
                this.eventEmitter.emit('subscription.payment.recorded', { subscriptionId: sub.id, paymentId: payment.id });
            }
            this.logger.log(`Culqi: suscripción ${sub.id} renovada hasta ${action.periodEnd.toISOString()}`);
        } else if (action.kind === 'canceled') {
            sub.status = 'canceled';
            sub.canceledAt = new Date();
            await this.subscriptionsRepo.save(sub);
            this.eventEmitter.emit('subscription.canceled', { subscriptionId: sub.id, canceledAt: sub.canceledAt });
            this.logger.log(`Culqi: suscripción ${sub.id} cancelada en Culqi`);
        } else {
            sub.status = 'past_due';
            await this.subscriptionsRepo.save(sub);
            this.logger.warn(`Culqi: suscripción ${sub.id} sin renovar, pasa a pago pendiente`);
        }
    }

    getPlans() {
        return TIER_DEFINITIONS.map((def) => ({
            tier: def.tier,
            name: def.name,
            price: this.planAmountFor(def.tier) / 100,
            currency: 'PEN',
            interval: 'monthly',
            features: def.features,
            configured: !!this.planIdFor(def.tier),
        }));
    }
}
