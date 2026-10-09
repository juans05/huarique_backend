// Decide qué hacer con una suscripción local según lo que devuelve
// GET /v2/recurrent/subscriptions/{id} (formato de apidocs.culqi.com/apiculqi.yaml).
// No depende del formato de los webhooks: el webhook solo dispara la consulta a Culqi.

/** Estados de Culqi: 1 creada, 2 prueba, 3 activa, 4 cancelada, 5 en cola, 6 vencida. */
export const CULQI_STATUS = { CANCELED: 4, EXPIRED: 6 } as const;

/** Días que se espera la renovación después del fin del periodo antes de marcar "pago pendiente". */
export const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LocalSubState {
    status: string;
    currentPeriodEnd: Date | null;
}

export interface CulqiSubLike {
    status?: number;
    next_billing_date?: number;
    periods?: { charges?: { charge_id?: string } | null } | null;
}

export type SyncAction =
    | { kind: 'none' }
    | { kind: 'renewed'; periodStart: Date; periodEnd: Date; chargeId: string }
    | { kind: 'canceled' }
    | { kind: 'past_due' };

export function decideSync(local: LocalSubState, remote: CulqiSubLike, now = new Date()): SyncAction {
    if (remote.status === CULQI_STATUS.CANCELED) return { kind: 'canceled' };
    if (remote.status === CULQI_STATUS.EXPIRED) return local.status === 'past_due' ? { kind: 'none' } : { kind: 'past_due' };

    const next = remote.next_billing_date;
    // Sin fecha legible no se toca nada: mejor no bloquear a un cliente que sí paga.
    if (!next) return { kind: 'none' };
    const remoteEnd = new Date(next * 1000);
    const localEnd = local.currentPeriodEnd ? new Date(local.currentPeriodEnd) : null;

    // Posible cobro: la próxima fecha de Culqi avanzó (1 día de margen por redondeos del alta) Y hay un cargo.
    // Es solo un candidato: el servicio lo confirma consultando el cargo en Culqi antes de dar acceso.
    const chargeId = remote.periods?.charges?.charge_id;
    if (chargeId && (!localEnd || remoteEnd.getTime() > localEnd.getTime() + DAY_MS)) {
        return { kind: 'renewed', periodStart: localEnd ?? now, periodEnd: remoteEnd, chargeId };
    }

    if ((local.status === 'active' || local.status === 'pending') && localEnd && now.getTime() > localEnd.getTime() + GRACE_DAYS * DAY_MS) {
        return { kind: 'past_due' };
    }
    return { kind: 'none' };
}

/** Separa "Juan Pérez Soto" en nombre y apellidos, como pide Culqi al crear el cliente. */
export function splitFullName(fullName: string | null | undefined, fallback: string): { firstName: string; lastName: string } {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: fallback, lastName: fallback };
    if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
