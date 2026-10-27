import { MigrationInterface, QueryRunner } from 'typeorm';

// App del barbero: marca de la push "ya te toca" para no avisar dos veces la misma cita.
export class AppointmentPushedAt1787700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.appointments ADD COLUMN IF NOT EXISTS upcoming_pushed_at timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.appointments DROP COLUMN IF EXISTS upcoming_pushed_at`);
  }
}
