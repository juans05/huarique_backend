import { MigrationInterface, QueryRunner } from 'typeorm';

// Caja: turnos (apertura/cierre), comprobantes con serie y número, precuenta pedida por el mozo y series por local.
export class Caja1787570000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.cash_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        status varchar(10) NOT NULL DEFAULT 'ABIERTA',
        opening_amount int NOT NULL DEFAULT 0,
        opened_by_user_id uuid NOT NULL,
        opened_at timestamptz NOT NULL DEFAULT now(),
        closed_by_user_id uuid,
        closed_at timestamptz,
        expected_cash int,
        counted_cash int,
        totals jsonb
      )
    `);
    // Una sola caja abierta por local: la numeración de comprobantes se serializa sobre esa fila.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_open
      ON wuarike_db.cash_sessions (place_id) WHERE status = 'ABIERTA'
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.receipts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        cash_session_id uuid NOT NULL REFERENCES wuarike_db.cash_sessions(id),
        tab_id uuid,
        table_name varchar(60),
        payment_id uuid,
        doc_type varchar(12) NOT NULL,
        series varchar(4) NOT NULL,
        number int NOT NULL,
        customer_doc_type varchar(4),
        customer_doc_number varchar(15),
        customer_name varchar(200),
        customer_address varchar(300),
        payment_method varchar(12) NOT NULL,
        total int NOT NULL,
        created_by_user_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_receipts_number UNIQUE (place_id, series, number)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_receipts_session ON wuarike_db.receipts (cash_session_id)`);
    await queryRunner.query(`ALTER TABLE wuarike_db.tabs ADD COLUMN IF NOT EXISTS precuenta jsonb`);
    await queryRunner.query(`
      ALTER TABLE wuarike_db.place_order_settings
      ADD COLUMN IF NOT EXISTS receipt_series jsonb NOT NULL
      DEFAULT '{"TICKET":"T001","BOLETA":"B001","FACTURA":"F001","NOTA_CREDITO":"FC01"}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.place_order_settings DROP COLUMN IF EXISTS receipt_series`);
    await queryRunner.query(`ALTER TABLE wuarike_db.tabs DROP COLUMN IF EXISTS precuenta`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.receipts`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.cash_sessions`);
  }
}
