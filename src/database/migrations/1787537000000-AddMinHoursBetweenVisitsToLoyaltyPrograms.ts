import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMinHoursBetweenVisitsToLoyaltyPrograms1787537000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.loyalty_programs
      ADD COLUMN IF NOT EXISTS min_hours_between_visits int NOT NULL DEFAULT 24
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.loyalty_programs
      DROP COLUMN IF EXISTS min_hours_between_visits
    `);
  }
}
