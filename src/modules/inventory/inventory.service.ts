import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { InventoryItem, InventoryMovement, MermaReason, MovementType, RecipeItem, Supplier } from './entities/inventory.entity';
import { Dish } from '../places/entities/dish.entity';
import { toCents } from '../orders/order-rules';

type MoveInput = {
    itemId: string; type: MovementType; quantity: number; reason?: string | null; unitCost?: number;
    mermaReason?: MermaReason | null; dishId?: string | null; refType?: 'RECEIPT' | 'ORDER' | null; refId?: string | null; userId?: string | null;
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Inventario: stock de insumos y productos, kardex, mermas, proveedores y recetas (qué consume cada ítem). */
@Injectable()
export class InventoryService {
    private readonly logger = new Logger(InventoryService.name);

    constructor(
        @InjectRepository(InventoryItem) private itemsRepo: Repository<InventoryItem>,
        @InjectRepository(InventoryMovement) private movesRepo: Repository<InventoryMovement>,
        @InjectRepository(Supplier) private suppliersRepo: Repository<Supplier>,
        @InjectRepository(RecipeItem) private recipesRepo: Repository<RecipeItem>,
        @InjectRepository(Dish) private dishesRepo: Repository<Dish>,
        private dataSource: DataSource,
    ) { }

    // ── Insumos y productos ─────────────────────────────────────────────
    async overview(placeId: string) {
        const [items, suppliers] = await Promise.all([
            this.itemsRepo.find({ where: { placeId }, order: { name: 'ASC' } }),
            this.suppliersRepo.find({ where: { placeId } }),
        ]);
        const active = items.filter((i) => i.active);
        return {
            kpis: {
                total: active.length,
                valuation: Math.round(active.reduce((s, i) => s + Math.max(0, i.stock) * i.unitCost, 0)),
                alert: active.filter((i) => i.stock > 0 && i.stock <= i.minStock).length,
                out: active.filter((i) => i.stock <= 0).length,
            },
            items: items.map((i) => ({ ...i, supplierName: suppliers.find((s) => s.id === i.supplierId)?.name ?? null, status: this.status(i) })),
        };
    }

    async saveItem(placeId: string, id: string | null, dto: Partial<InventoryItem>) {
        const current = id ? await this.itemsRepo.findOne({ where: { id, placeId } }) : null;
        if (id && !current) throw new NotFoundException('Insumo no encontrado');
        if (dto.supplierId && !(await this.suppliersRepo.findOne({ where: { id: dto.supplierId, placeId } }))) throw new BadRequestException('Proveedor no encontrado');
        const { stock, ...editable } = dto; // el stock solo cambia con movimientos (kardex)
        const code = dto.code?.trim().toUpperCase() || current?.code || (await this.nextCode(placeId));
        try {
            const saved = await this.itemsRepo.save({ ...(current ?? { placeId, stock: 0, active: true }), ...editable, code, name: dto.name?.trim() ?? current!.name });
            // Stock inicial: se registra como ingreso para que el kardex cuadre desde el primer día.
            if (!current && stock && stock > 0) await this.move(placeId, { itemId: saved.id, type: 'INGRESO', quantity: stock, unitCost: saved.unitCost, reason: 'Inventario inicial' });
            return this.itemsRepo.findOne({ where: { id: saved.id } });
        } catch (err: any) {
            if (err?.code === '23505') throw new BadRequestException('Ya existe un insumo con ese código');
            throw err;
        }
    }

    /** Compra o ingreso de mercadería: suma stock y actualiza el costo promedio. */
    ingreso(placeId: string, userId: string, dto: { itemId: string; quantity: number; unitCost?: number; reason?: string }) {
        if (!(dto.quantity > 0)) throw new BadRequestException('La cantidad debe ser mayor a cero');
        return this.move(placeId, { itemId: dto.itemId, type: 'INGRESO', quantity: dto.quantity, unitCost: dto.unitCost, reason: dto.reason || 'Compra de reposición', userId });
    }

    /** Ajuste por conteo físico: deja el stock exactamente en lo contado. */
    async ajuste(placeId: string, userId: string, dto: { itemId: string; counted: number; reason?: string }) {
        const item = await this.requireItem(placeId, dto.itemId);
        const diff = round3(dto.counted - item.stock);
        if (!diff) return item;
        return this.move(placeId, { itemId: item.id, type: 'AJUSTE', quantity: diff, reason: dto.reason || 'Conteo físico', userId });
    }

    /** Merma: insumo crudo (itemId) o plato terminado (dishId: descuenta su receta). */
    async merma(placeId: string, userId: string, dto: { itemId?: string; dishId?: string; quantity: number; mermaReason: MermaReason; reason?: string }) {
        if (!(dto.quantity > 0)) throw new BadRequestException('La cantidad debe ser mayor a cero');
        if (dto.itemId) return [await this.move(placeId, { itemId: dto.itemId, type: 'MERMA', quantity: -dto.quantity, mermaReason: dto.mermaReason, reason: dto.reason, userId })];
        if (!dto.dishId) throw new BadRequestException('Indica el insumo o el plato');
        const lines = await this.recipesRepo.find({ where: { placeId, dishId: dto.dishId } });
        if (!lines.length) throw new BadRequestException('Ese plato no tiene receta: registra la merma por insumo');
        return this.dataSource.transaction((em) => this.sequential([...lines].sort((a, b) => a.itemId.localeCompare(b.itemId)), (l) => this.move(placeId, {
            itemId: l.itemId, type: 'MERMA', quantity: -round3(l.quantity * dto.quantity), mermaReason: dto.mermaReason, dishId: dto.dishId, reason: dto.reason, userId,
        }, em)));
    }

    async kardex(placeId: string, type?: MovementType) {
        const moves = await this.movesRepo.find({ where: { placeId, ...(type ? { type } : {}) }, order: { createdAt: 'DESC' }, take: 300 });
        const items = moves.length ? await this.itemsRepo.find({ where: { id: In([...new Set(moves.map((m) => m.itemId))]) } }) : [];
        const dishIds = [...new Set(moves.map((m) => m.dishId).filter(Boolean))] as string[];
        const dishes = dishIds.length ? await this.dishesRepo.find({ where: { id: In(dishIds) }, select: ['id', 'name'] }) : [];
        return moves.map((m) => {
            const item = items.find((i) => i.id === m.itemId);
            return { ...m, itemName: item?.name ?? '—', unit: item?.unit ?? '', dishName: dishes.find((d) => d.id === m.dishId)?.name ?? null, loss: m.type === 'MERMA' ? Math.round(Math.abs(m.quantity) * m.unitCost) : 0 };
        });
    }

    // ── Proveedores ─────────────────────────────────────────────────────
    async suppliers(placeId: string) {
        const [list, items] = await Promise.all([this.suppliersRepo.find({ where: { placeId }, order: { name: 'ASC' } }), this.itemsRepo.find({ where: { placeId }, select: ['id', 'supplierId'] })]);
        return list.map((s) => ({ ...s, itemsCount: items.filter((i) => i.supplierId === s.id).length }));
    }

    async saveSupplier(placeId: string, id: string | null, dto: Partial<Supplier>) {
        const current = id ? await this.suppliersRepo.findOne({ where: { id, placeId } }) : null;
        if (id && !current) throw new NotFoundException('Proveedor no encontrado');
        return this.suppliersRepo.save({ ...(current ?? { placeId }), ...dto, name: dto.name?.trim() ?? current!.name });
    }

    // ── Recetas (fichas técnicas) ───────────────────────────────────────
    /** Cada ítem del catálogo con su receta, costo, precio, margen y food cost. */
    async recipes(placeId: string) {
        const [dishes, lines, items] = await Promise.all([
            this.dishesRepo.find({ where: { placeId }, order: { name: 'ASC' } }),
            this.recipesRepo.find({ where: { placeId } }),
            this.itemsRepo.find({ where: { placeId } }),
        ]);
        return dishes.map((d) => {
            const own = lines.filter((l) => l.dishId === d.id).map((l) => {
                const item = items.find((i) => i.id === l.itemId);
                return { itemId: l.itemId, name: item?.name ?? '—', unit: item?.unit ?? '', quantity: l.quantity, cost: Math.round(l.quantity * (item?.unitCost ?? 0)) };
            });
            const cost = own.reduce((s, l) => s + l.cost, 0);
            const price = toCents(d.price as any);
            return { dishId: d.id, name: d.name, price, cost, margin: price - cost, foodCost: price > 0 ? Math.round((cost / price) * 100) : null, lines: own };
        });
    }

    async setRecipe(placeId: string, dishId: string, lines: { itemId: string; quantity: number }[]) {
        if (!(await this.dishesRepo.findOne({ where: { id: dishId, placeId } }))) throw new NotFoundException('Ítem del catálogo no encontrado');
        const items = await this.itemsRepo.find({ where: { placeId, id: In(lines.map((l) => l.itemId).concat('00000000-0000-0000-0000-000000000000')) } });
        if (lines.some((l) => !items.some((i) => i.id === l.itemId) || !(l.quantity > 0))) throw new BadRequestException('Revisa los insumos y cantidades de la receta');
        await this.dataSource.transaction(async (em) => {
            await em.delete(RecipeItem, { placeId, dishId });
            if (lines.length) await em.insert(RecipeItem, lines.map((l) => ({ placeId, dishId, itemId: l.itemId, quantity: l.quantity })));
        });
        return (await this.recipes(placeId)).find((r) => r.dishId === dishId);
    }

    // ── Descuento automático ────────────────────────────────────────────
    /** Cocina empieza a preparar un pedido: descuenta la receta de cada plato (una sola vez por pedido). */
    @OnEvent('orders.status.changed', { async: true })
    async onOrderStatus(payload: { orderId: string; status: string }) {
        if (payload.status !== 'EN_PREPARACION') return;
        try {
            const [claimed] = await this.dataSource.query(
                `UPDATE wuarike_db.orders SET stock_deducted_at = now() WHERE id = $1 AND stock_deducted_at IS NULL RETURNING place_id`, [payload.orderId]);
            const placeId = claimed?.[0]?.place_id ?? claimed?.place_id;
            if (!placeId) return;
            const lines = await this.dataSource.query(`SELECT dish_id AS "dishId", quantity FROM wuarike_db.order_items WHERE order_id = $1 AND dish_id IS NOT NULL`, [payload.orderId]);
            await this.deduct(placeId, lines, 'COCINA', 'ORDER', payload.orderId, null);
        } catch (err) {
            this.logger.error(`No se pudo descontar el pedido ${payload.orderId}: ${(err as Error).message}`);
        }
    }

    /** Venta en caja (mostrador o cita): descuenta lo vendido. */
    @OnEvent('cash.sale', { async: true })
    async onSale(payload: { placeId: string; receiptId: string; userId: string; lines: { dishId: string | null; quantity: number }[] }) {
        try {
            await this.deduct(payload.placeId, payload.lines.filter((l) => l.dishId) as { dishId: string; quantity: number }[], 'VENTA', 'RECEIPT', payload.receiptId, payload.userId);
        } catch (err) {
            this.logger.error(`No se pudo descontar la venta ${payload.receiptId}: ${(err as Error).message}`);
        }
    }

    private async deduct(placeId: string, sold: { dishId: string; quantity: number }[], type: 'VENTA' | 'COCINA', refType: 'RECEIPT' | 'ORDER', refId: string, userId: string | null) {
        if (!sold.length) return;
        const recipes = await this.recipesRepo.find({ where: { placeId, dishId: In(sold.map((s) => s.dishId)) } });
        // Suma por insumo (dos platos que usan cebolla = un solo movimiento de cebolla).
        const perItem = new Map<string, number>();
        for (const s of sold) for (const r of recipes.filter((x) => x.dishId === s.dishId)) perItem.set(r.itemId, round3((perItem.get(r.itemId) ?? 0) + r.quantity * s.quantity));
        if (!perItem.size) return;
        // Siempre en el mismo orden y de a uno: dos ventas simultáneas no se bloquean entre sí.
        const ordered = [...perItem].sort(([a], [b]) => a.localeCompare(b));
        await this.dataSource.transaction((em) => this.sequential(ordered, ([itemId, qty]) => this.move(placeId, { itemId, type, quantity: -qty, refType, refId, userId, reason: type === 'VENTA' ? 'Venta en caja' : 'Descuento automático de cocina' }, em)));
    }

    // ── Internos ────────────────────────────────────────────────────────
    /** Único lugar que cambia stock: bloquea el insumo, registra el movimiento con stock antes/después. */
    private async move(placeId: string, m: MoveInput, em?: EntityManager): Promise<InventoryItem> {
        const run = async (tx: EntityManager) => {
            const [row] = await tx.query(`SELECT id, stock, unit_cost FROM wuarike_db.inventory_items WHERE id = $1 AND place_id = $2 FOR UPDATE`, [m.itemId, placeId]);
            if (!row) throw new NotFoundException('Insumo no encontrado');
            const before = parseFloat(row.stock);
            const after = round3(before + m.quantity);
            let unitCost: number = row.unit_cost;
            // Costo promedio ponderado al ingresar mercadería con costo nuevo.
            if (m.type === 'INGRESO' && m.unitCost != null && m.unitCost >= 0) {
                unitCost = before > 0 ? Math.round((before * row.unit_cost + m.quantity * m.unitCost) / (before + m.quantity)) : m.unitCost;
            }
            await tx.query(`UPDATE wuarike_db.inventory_items SET stock = $1, unit_cost = $2 WHERE id = $3`, [after, unitCost, m.itemId]);
            await tx.insert(InventoryMovement, {
                placeId, itemId: m.itemId, type: m.type, quantity: round3(m.quantity), stockBefore: before, stockAfter: after, unitCost,
                reason: m.reason ?? null, mermaReason: m.mermaReason ?? null, dishId: m.dishId ?? null, refType: m.refType ?? null, refId: m.refId ?? null, createdByUserId: m.userId ?? null,
            });
            return { ...(await tx.findOne(InventoryItem, { where: { id: m.itemId } }))! };
        };
        return em ? run(em) : this.dataSource.transaction(run);
    }

    private async sequential<T, R>(list: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
        const out: R[] = [];
        for (const x of list) out.push(await fn(x));
        return out;
    }

    private async requireItem(placeId: string, id: string) {
        const item = await this.itemsRepo.findOne({ where: { id, placeId } });
        if (!item) throw new NotFoundException('Insumo no encontrado');
        return item;
    }

    private status(i: InventoryItem) {
        return i.stock <= 0 ? 'AGOTADO' : i.stock <= i.minStock ? 'ALERTA' : 'OPTIMO';
    }

    private async nextCode(placeId: string) {
        const [{ n }] = await this.dataSource.query(`SELECT count(*)::int + 1 AS n FROM wuarike_db.inventory_items WHERE place_id = $1`, [placeId]);
        return `INS-${String(n).padStart(3, '0')}`;
    }
}
