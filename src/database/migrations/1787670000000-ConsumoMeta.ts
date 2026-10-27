import { MigrationInterface, QueryRunner } from 'typeorm';

// Consumo de WhatsApp por local: un registro por mensaje saliente (el webhook de estados le pone categoría y costo al
// entregarse), tarifas de Meta editables con fecha de vigencia y la cifra oficial diaria de pricing_analytics.
export class ConsumoMeta1787670000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.whatsapp_message_costs (
        wamid varchar(200) PRIMARY KEY,
        place_id uuid NOT NULL,
        phone_number_id varchar(64) NOT NULL,
        waba_id varchar(64),
        source varchar(16) NOT NULL,
        recipient_market varchar(16),
        category varchar(32),
        pricing_type varchar(40),
        pricing_subtype varchar(40),
        billable boolean,
        sent_at timestamptz NOT NULL DEFAULT now(),
        delivered_at timestamptz,
        est_cost numeric(12, 4),
        currency varchar(3)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_wa_costs_place_sent ON wuarike_db.whatsapp_message_costs (place_id, sent_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_wa_costs_number_sent ON wuarike_db.whatsapp_message_costs (phone_number_id, sent_at)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.whatsapp_rates (
        market varchar(16) NOT NULL,
        category varchar(32) NOT NULL,
        currency varchar(3) NOT NULL,
        rate_per_message numeric(12, 4) NOT NULL,
        valid_from date NOT NULL,
        PRIMARY KEY (market, category, currency, valid_from)
      )
    `);
    // Tarifa oficial de Meta en PEN, vigente desde el 1-oct-2026 (rate card "Cost per message in PEN").
    await queryRunner.query(`
      INSERT INTO wuarike_db.whatsapp_rates (market, category, currency, rate_per_message, valid_from) VALUES
        ('PE', 'marketing', 'PEN', 0.2339, '2026-10-01'), ('PE', 'utility', 'PEN', 0.0998, '2026-10-01'),
        ('PE', 'authentication', 'PEN', 0.0998, '2026-10-01'), ('PE', 'service', 'PEN', 0.0998, '2026-10-01'),
        ('LATAM', 'marketing', 'PEN', 0.2462, '2026-10-01'), ('LATAM', 'utility', 'PEN', 0.0376, '2026-10-01'),
        ('LATAM', 'authentication', 'PEN', 0.0376, '2026-10-01'), ('LATAM', 'service', 'PEN', 0.0376, '2026-10-01'),
        ('OTHER', 'marketing', 'PEN', 0.2009, '2026-10-01'), ('OTHER', 'utility', 'PEN', 0.0256, '2026-10-01'),
        ('OTHER', 'authentication', 'PEN', 0.0256, '2026-10-01'), ('OTHER', 'service', 'PEN', 0.0256, '2026-10-01')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.whatsapp_daily_costs (
        waba_id varchar(64) NOT NULL,
        day date NOT NULL,
        category varchar(32) NOT NULL,
        pricing_type varchar(40) NOT NULL,
        country varchar(8) NOT NULL,
        volume int NOT NULL,
        cost numeric(12, 4) NOT NULL,
        currency varchar(3),
        PRIMARY KEY (waba_id, day, category, pricing_type, country)
      )
    `);
    // Moneda de la cuenta de WhatsApp (la elige el local en Meta y no cambia): se consulta una vez y se guarda.
    await queryRunner.query(`ALTER TABLE wuarike_db.whatsapp_numbers ADD COLUMN IF NOT EXISTS billing_currency varchar(3)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.whatsapp_numbers DROP COLUMN IF EXISTS billing_currency`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.whatsapp_daily_costs`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.whatsapp_rates`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.whatsapp_message_costs`);
  }
}
