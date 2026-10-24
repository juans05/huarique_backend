import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

const numeric = { to: (v: number) => v, from: (v: string) => parseFloat(v) };

export type MovementType = 'INGRESO' | 'VENTA' | 'COCINA' | 'MERMA' | 'AJUSTE';
export type MermaReason = 'QUEMADO' | 'VENCIDO' | 'DERRAME' | 'DEVOLUCION' | 'ERROR_COMANDA' | 'CONTAMINACION' | 'OTRO';

@Entity('suppliers')
export class Supplier {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column() name: string;
    @Column({ type: 'varchar', nullable: true }) ruc: string | null;
    @Column({ type: 'varchar', nullable: true }) category: string | null;
    @Column({ name: 'contact_name', type: 'varchar', nullable: true }) contactName: string | null;
    @Column({ type: 'varchar', nullable: true }) phone: string | null;
    @Column({ type: 'varchar', nullable: true }) email: string | null;
    @Column({ type: 'varchar', nullable: true }) notes: string | null;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

/** Insumo (cocina) o producto (venta): lo que tiene stock. Costo unitario en céntimos por unidad. */
@Entity('inventory_items')
export class InventoryItem {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column() code: string;
    @Column() name: string;
    @Column({ type: 'varchar', nullable: true }) category: string | null;
    @Column({ default: 'unidad' }) unit: string;
    @Column({ type: 'numeric', precision: 14, scale: 3, default: 0, transformer: numeric }) stock: number;
    @Column({ name: 'min_stock', type: 'numeric', precision: 14, scale: 3, default: 0, transformer: numeric }) minStock: number;
    @Column({ name: 'unit_cost', type: 'int', default: 0 }) unitCost: number;
    @Column({ name: 'supplier_id', type: 'uuid', nullable: true }) supplierId: string | null;
    @Column({ default: true }) active: boolean;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

/** Kardex: cada entrada o salida de stock, con el stock antes y después. */
@Entity('inventory_movements')
export class InventoryMovement {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column({ name: 'item_id' }) itemId: string;
    @Column() type: MovementType;
    /** Con signo: + entra, − sale. */
    @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric }) quantity: number;
    @Column({ name: 'stock_before', type: 'numeric', precision: 14, scale: 3, transformer: numeric }) stockBefore: number;
    @Column({ name: 'stock_after', type: 'numeric', precision: 14, scale: 3, transformer: numeric }) stockAfter: number;
    @Column({ name: 'unit_cost', type: 'int', default: 0 }) unitCost: number;
    @Column({ type: 'varchar', nullable: true }) reason: string | null;
    @Column({ name: 'merma_reason', type: 'varchar', nullable: true }) mermaReason: MermaReason | null;
    /** Merma de un plato terminado: qué plato se dio de baja. */
    @Column({ name: 'dish_id', type: 'uuid', nullable: true }) dishId: string | null;
    @Column({ name: 'ref_type', type: 'varchar', nullable: true }) refType: 'RECEIPT' | 'ORDER' | null;
    @Column({ name: 'ref_id', type: 'uuid', nullable: true }) refId: string | null;
    @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true }) createdByUserId: string | null;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

/** Qué consume un ítem del catálogo: receta de un plato, o 1 x el mismo producto si se revende tal cual. */
@Entity('recipe_items')
export class RecipeItem {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column({ name: 'dish_id' }) dishId: string;
    @Column({ name: 'item_id' }) itemId: string;
    @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric }) quantity: number;
}
