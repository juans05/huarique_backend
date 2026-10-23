import { MigrationInterface, QueryRunner } from 'typeorm';

// Fichas por cliente según el rubro: mascota (veterinaria/grooming) o vehículo (taller/lavadero). La cita indica cuál se atiende.
export class Fichas1787630000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.customer_assets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        customer_phone varchar(30) NOT NULL,
        customer_name varchar(120),
        kind varchar(8) NOT NULL,
        name varchar(80) NOT NULL,
        data jsonb NOT NULL DEFAULT '{}',
        notes varchar(1000),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_customer_assets_phone ON wuarike_db.customer_assets (place_id, customer_phone)`);
    await queryRunner.query(`ALTER TABLE wuarike_db.appointments ADD COLUMN IF NOT EXISTS asset_id uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.appointments DROP COLUMN IF EXISTS asset_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.customer_assets`);
  }
}
