import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuspiciousToCheckins1787550000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.checkins
      ADD COLUMN IF NOT EXISTS is_suspicious boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS suspicious_reason varchar(200)
    `);
    // El feed y las métricas por local filtran por esta columna en cada
    // consulta, así que sin índice cada lectura del feed hace scan completo.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_checkins_is_suspicious
      ON wuarike_db.checkins (is_suspicious)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.idx_checkins_is_suspicious`);
    await queryRunner.query(`
      ALTER TABLE wuarike_db.checkins
      DROP COLUMN IF EXISTS is_suspicious,
      DROP COLUMN IF EXISTS suspicious_reason
    `);
  }
}
