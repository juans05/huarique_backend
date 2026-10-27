import { MigrationInterface, QueryRunner } from 'typeorm';

// App del barbero: celulares registrados para recibir push (token de Expo por usuario).
export class PushDevices1787690000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.push_devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES wuarike_db.users(id) ON DELETE CASCADE,
        token varchar(200) NOT NULL UNIQUE,
        platform varchar(10) NOT NULL DEFAULT 'android',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_push_devices_user ON wuarike_db.push_devices (user_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.push_devices`);
  }
}
