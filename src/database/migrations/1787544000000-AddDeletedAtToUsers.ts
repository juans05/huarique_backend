import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedAtToUsers1787544000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.users
      ADD COLUMN IF NOT EXISTS deleted_at timestamp
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.users
      DROP COLUMN IF EXISTS deleted_at
    `);
  }
}
