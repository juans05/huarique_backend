import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrivacySettingsToUsers1787528000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.users
        ADD COLUMN IF NOT EXISTS is_profile_public boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS are_favorites_public boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS allow_business_messages boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS is_discoverable boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.users
        DROP COLUMN IF EXISTS is_profile_public,
        DROP COLUMN IF EXISTS are_favorites_public,
        DROP COLUMN IF EXISTS allow_business_messages,
        DROP COLUMN IF EXISTS is_discoverable
    `);
  }
}
