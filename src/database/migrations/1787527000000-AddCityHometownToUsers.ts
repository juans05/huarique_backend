import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCityHometownToUsers1787527000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.users
        ADD COLUMN IF NOT EXISTS city varchar(100),
        ADD COLUMN IF NOT EXISTS hometown varchar(100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.users
        DROP COLUMN IF EXISTS city,
        DROP COLUMN IF EXISTS hometown
    `);
  }
}
