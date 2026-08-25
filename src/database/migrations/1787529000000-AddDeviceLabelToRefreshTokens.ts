import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeviceLabelToRefreshTokens1787529000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.refresh_tokens
        ADD COLUMN IF NOT EXISTS device_label varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.refresh_tokens
        DROP COLUMN IF EXISTS device_label
    `);
  }
}
