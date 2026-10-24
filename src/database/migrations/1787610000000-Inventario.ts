import { MigrationInterface, QueryRunner } from 'typeorm';

// Inventario: insumos/productos con stock, kardex de movimientos, proveedores y "qué consume cada ítem del
// catálogo" (receta). Un producto que se revende tal cual (gaseosa, cera) es una receta de 1 insumo x 1 unidad.
export class Inventario1787610000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.suppliers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        name varchar(150) NOT NULL,
        ruc varchar(11),
        category varchar(80),
        contact_name varchar(120),
        phone varchar(30),
        email varchar(150),
        notes varchar(300),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_suppliers_place ON wuarike_db.suppliers (place_id)`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.inventory_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        code varchar(20) NOT NULL,
        name varchar(150) NOT NULL,
        category varchar(80),
        unit varchar(12) NOT NULL DEFAULT 'unidad',
        stock numeric(14,3) NOT NULL DEFAULT 0,
        min_stock numeric(14,3) NOT NULL DEFAULT 0,
        unit_cost int NOT NULL DEFAULT 0,
        supplier_id uuid REFERENCES wuarike_db.suppliers(id) ON DELETE SET NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_inventory_code UNIQUE (place_id, code)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_inventory_items_place ON wuarike_db.inventory_items (place_id)`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.inventory_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        item_id uuid NOT NULL REFERENCES wuarike_db.inventory_items(id) ON DELETE CASCADE,
        type varchar(10) NOT NULL,
        quantity numeric(14,3) NOT NULL,
        stock_before numeric(14,3) NOT NULL,
        stock_after numeric(14,3) NOT NULL,
        unit_cost int NOT NULL DEFAULT 0,
        reason varchar(300),
        merma_reason varchar(20),
        dish_id uuid,
        ref_type varchar(10),
        ref_id uuid,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_inventory_movements_place ON wuarike_db.inventory_movements (place_id, created_at DESC)`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.recipe_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        dish_id uuid NOT NULL,
        item_id uuid NOT NULL REFERENCES wuarike_db.inventory_items(id) ON DELETE CASCADE,
        quantity numeric(14,3) NOT NULL,
        CONSTRAINT uq_recipe_line UNIQUE (dish_id, item_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_recipe_items_dish ON wuarike_db.recipe_items (dish_id)`);
    // Pedido ya descontado del inventario (al empezar a prepararse): no se descuenta dos veces.
    await queryRunner.query(`ALTER TABLE wuarike_db.orders ADD COLUMN IF NOT EXISTS stock_deducted_at timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.orders DROP COLUMN IF EXISTS stock_deducted_at`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.recipe_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.inventory_movements`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.inventory_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.suppliers`);
  }
}
