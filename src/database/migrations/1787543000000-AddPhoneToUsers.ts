import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhoneToUsers1787543000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.users
      ADD COLUMN IF NOT EXISTS phone varchar(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.users
      DROP COLUMN IF EXISTS phone
    `);
  }
}
