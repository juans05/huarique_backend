import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWinbackToLoyalty1787541000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.loyalty_programs
      ADD COLUMN IF NOT EXISTS winback_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS winback_message text
    `);
    await queryRunner.query(`
      ALTER TABLE wuarike_db.loyalty_cards
      ADD COLUMN IF NOT EXISTS last_winback_sent_at timestamp
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.loyalty_programs
      DROP COLUMN IF EXISTS winback_enabled,
      DROP COLUMN IF EXISTS winback_message
    `);
    await queryRunner.query(`
      ALTER TABLE wuarike_db.loyalty_cards
      DROP COLUMN IF EXISTS last_winback_sent_at
    `);
  }
}
