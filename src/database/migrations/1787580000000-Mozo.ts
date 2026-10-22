import { MigrationInterface, QueryRunner } from 'typeorm';

// Mozo en sala: rol 'mozo' (y 'cocina', que faltaba en el CHECK), mozo asignado a la cuenta de mesa,
// quién tomó cada pedido e interruptor de pago online de la cuenta (antes en migrations/add_cobro_mozo.sql).
export class Mozo1787580000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.place_team_members DROP CONSTRAINT IF EXISTS place_team_members_role_check`);
    await queryRunner.query(`
      ALTER TABLE wuarike_db.place_team_members
      ADD CONSTRAINT place_team_members_role_check CHECK (role IN ('admin', 'supervisor', 'agente', 'mozo', 'cocina'))
    `);
    await queryRunner.query(`ALTER TABLE wuarike_db.place_order_settings ADD COLUMN IF NOT EXISTS table_online_payment_enabled boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE wuarike_db.tabs ADD COLUMN IF NOT EXISTS waiter_user_id uuid`);
    await queryRunner.query(`ALTER TABLE wuarike_db.orders ADD COLUMN IF NOT EXISTS taken_by_user_id uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.orders DROP COLUMN IF EXISTS taken_by_user_id`);
    await queryRunner.query(`ALTER TABLE wuarike_db.tabs DROP COLUMN IF EXISTS waiter_user_id`);
    // table_online_payment_enabled y el CHECK de roles se dejan: otras ramas ya los aplicaron con add_cobro_mozo.sql.
  }
}
