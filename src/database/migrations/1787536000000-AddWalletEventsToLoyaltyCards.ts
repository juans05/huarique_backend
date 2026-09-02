import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletEventsToLoyaltyCards1787536000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.loyalty_cards
      ADD COLUMN google_wallet_saved_at timestamp,
      ADD COLUMN google_wallet_deleted_at timestamp
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.loyalty_cards
      DROP COLUMN IF EXISTS google_wallet_saved_at,
      DROP COLUMN IF EXISTS google_wallet_deleted_at
    `);
  }
}
