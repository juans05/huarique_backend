import { MigrationInterface, QueryRunner } from 'typeorm';

// Campaña de tipo "recordatorio de cita": queda activa y le escribe a cada cita reservada X minutos antes.
// Activa = status SCHEDULED, pausada = DRAFT (no se agregan valores al enum de status).
export class CampanaRecordatorio1787680000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.broadcasts
        ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'mass',
        ADD COLUMN IF NOT EXISTS reminder_offset_min int
    `);
    // Un envío por campaña y cita: evita repetir si el cron corre dos veces o hay dos instancias.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.broadcast_reminder_sends (
        broadcast_id uuid NOT NULL REFERENCES wuarike_db.broadcasts(id) ON DELETE CASCADE,
        appointment_id uuid NOT NULL,
        ok boolean,
        sent_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (broadcast_id, appointment_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_broadcasts_reminder_active ON wuarike_db.broadcasts (place_id) WHERE kind = 'reminder' AND status = 'SCHEDULED'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.idx_broadcasts_reminder_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.broadcast_reminder_sends`);
    await queryRunner.query(`ALTER TABLE wuarike_db.broadcasts DROP COLUMN IF EXISTS reminder_offset_min, DROP COLUMN IF EXISTS kind`);
  }
}
