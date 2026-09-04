import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDishToCheckins1787539000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.checkins
      ADD COLUMN IF NOT EXISTS dish_name varchar(100),
      ADD COLUMN IF NOT EXISTS dish_price decimal(10,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.checkins
      DROP COLUMN IF EXISTS dish_name,
      DROP COLUMN IF EXISTS dish_price
    `);
  }
}
