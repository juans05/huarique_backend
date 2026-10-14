import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { OrderStatus } from './entities/order.entity';
import { PlaceTeamRole } from '../team/entities/place-team-member.entity';

const IGV = 0.18;

export function toCents(price: string | number | null): number {
    if (price === null || price === undefined || price === '') return 0;
    return Math.round(Number(price) * 100);
}

export function calculateTotals(items: { unitPrice: number; quantity: number }[], deliveryFee: number, pricesIncludeIgv: boolean) {
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    if (pricesIncludeIgv) {
        return { subtotal, deliveryFee, igv: subtotal - Math.round(subtotal / (1 + IGV)), total: subtotal + deliveryFee };
    }
    const igv = Math.round(subtotal * IGV);
    return { subtotal, deliveryFee, igv, total: subtotal + igv + deliveryFee };
}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    PENDIENTE_PAGO: ['NUEVO', 'CANCELADO'],
    NUEVO: ['EN_PREPARACION', 'CANCELADO'],
    EN_PREPARACION: ['LISTO', 'CANCELADO'],
    LISTO: ['ENTREGADO'],
    ENTREGADO: [],
    CANCELADO: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return TRANSITIONS[from].includes(to);
}

export function assertCanCancel(status: OrderStatus, role: PlaceTeamRole): void {
    if (!canTransition(status, 'CANCELADO')) throw new BadRequestException('No puedes cancelar un pedido ya listo o entregado');
    if (role === 'cocina') throw new ForbiddenException('Cocina no puede cancelar pedidos');
    if (status === 'EN_PREPARACION' && role === 'agente') throw new ForbiddenException('Solo un gerente puede cancelar un pedido en preparación');
}

export function newPublicToken(): string {
    return randomBytes(16).toString('hex');
}
