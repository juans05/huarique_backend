import { MigrationInterface, QueryRunner } from 'typeorm';

// Recordatorios de citas por WhatsApp: marca de envío 24 h y 2 h antes (cada uno se manda una sola vez).
export class Recordatorios1787620000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.appointments
      ADD COLUMN IF NOT EXISTS reminder_24_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS reminder_2_sent_at timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.appointments DROP COLUMN IF EXISTS reminder_24_sent_at, DROP COLUMN IF EXISTS reminder_2_sent_at`);
  }
}
