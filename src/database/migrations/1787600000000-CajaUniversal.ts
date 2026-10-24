import { MigrationInterface, QueryRunner } from 'typeorm';

// Caja para todos los rubros: venta directa en mostrador y cobro de citas, con el detalle de lo vendido.
export class CajaUniversal1787600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.receipts
      ADD COLUMN IF NOT EXISTS kind varchar(6) NOT NULL DEFAULT 'MESA',
      ADD COLUMN IF NOT EXISTS appointment_id uuid
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.receipt_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        receipt_id uuid NOT NULL REFERENCES wuarike_db.receipts(id) ON DELETE CASCADE,
        dish_id uuid,
        description varchar(150) NOT NULL,
        quantity int NOT NULL,
        unit_price int NOT NULL,
        line_total int NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON wuarike_db.receipt_items (receipt_id)`);
    // Una cita se cobra una sola vez.
    await queryRunner.query(`ALTER TABLE wuarike_db.appointments ADD COLUMN IF NOT EXISTS receipt_id uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.appointments DROP COLUMN IF EXISTS receipt_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.receipt_items`);
    await queryRunner.query(`ALTER TABLE wuarike_db.receipts DROP COLUMN IF EXISTS appointment_id, DROP COLUMN IF EXISTS kind`);
  }
}
