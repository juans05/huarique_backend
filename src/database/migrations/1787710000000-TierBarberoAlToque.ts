import { MigrationInterface, QueryRunner } from 'typeorm';

// Planes nuevos: el plan Barbero pasa a llamarse Al Toque.
export class TierBarberoAlToque1787710000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE wuarike_db.subscriptions SET tier = 'al_toque' WHERE tier = 'barbero'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE wuarike_db.subscriptions SET tier = 'barbero' WHERE tier = 'al_toque'`);
  }
}
