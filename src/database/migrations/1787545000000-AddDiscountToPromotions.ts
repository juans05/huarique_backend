import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiscountToPromotions1787545000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.promotions
      ADD COLUMN IF NOT EXISTS discount_type varchar(20),
      ADD COLUMN IF NOT EXISTS discount_value decimal(10,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.promotions
      DROP COLUMN IF EXISTS discount_type,
      DROP COLUMN IF EXISTS discount_value
    `);
  }
}
