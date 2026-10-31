import { MigrationInterface, QueryRunner } from 'typeorm';

// Pedidos desde la carta pública (QR general): cómo se cobran (solo en línea, o también al recibir).
// El canal WEB y el estado POR_CONFIRMAR no necesitan cambio de esquema: channel/status son varchar sin CHECK.
export class PedidosWeb1787720000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.place_order_settings ADD COLUMN IF NOT EXISTS web_payment_mode varchar(20) NOT NULL DEFAULT 'ONLINE'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.place_order_settings DROP COLUMN IF EXISTS web_payment_mode`);
  }
}
