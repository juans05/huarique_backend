import { MigrationInterface, QueryRunner } from 'typeorm';

// Recordatorios con tiempos elegidos por el local (un registro por cita y tiempo) y aviso de rutina por servicio
// ("cada N días"). Las columnas reminder_24_sent_at / reminder_2_sent_at quedan sin uso: se borran en otra migración.
export class RecordatoriosRutina1787660000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.appointment_reminders (
        appointment_id uuid NOT NULL,
        offset_min int NOT NULL,
        sent_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (appointment_id, offset_min)
      )
    `);
    // Lo ya enviado con el esquema anterior no se vuelve a mandar.
    await queryRunner.query(`
      INSERT INTO wuarike_db.appointment_reminders (appointment_id, offset_min, sent_at)
      SELECT id, 1440, reminder_24_sent_at FROM wuarike_db.appointments WHERE reminder_24_sent_at IS NOT NULL
      UNION ALL
      SELECT id, 120, reminder_2_sent_at FROM wuarike_db.appointments WHERE reminder_2_sent_at IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
    // Los locales que ya tenían recordatorios siguen recibiendo los dos de siempre (24 h y 2 h); los nuevos parten con uno.
    await queryRunner.query(`
      UPDATE wuarike_db.places p
      SET metadata = jsonb_set(COALESCE(p.metadata, '{}'::jsonb), '{reminders,offsetsMin}', '[1440, 120]'::jsonb, true)
      WHERE p.metadata->'reminders'->'offsetsMin' IS NULL
        AND EXISTS (SELECT 1 FROM wuarike_db.appointments a WHERE a.place_id = p.id)
    `);

    await queryRunner.query(`ALTER TABLE wuarike_db.dishes ADD COLUMN IF NOT EXISTS recall_days int, ADD COLUMN IF NOT EXISTS recall_notice_days int`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.appointment_recalls (
        source_appointment_id uuid PRIMARY KEY,
        place_id uuid NOT NULL,
        service_id uuid NOT NULL,
        customer_phone varchar(30) NOT NULL,
        sent_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Quién escribió BAJA, por local y teléfono (últimos 9 dígitos): marketing_consent=false no distingue entre
    // "nunca dio permiso" y "pidió la baja", y el aviso de rutina solo debe excluir a lo segundo.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.whatsapp_opt_outs (
        place_id uuid NOT NULL,
        phone9 varchar(9) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (place_id, phone9)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_appointment_recalls_place ON wuarike_db.appointment_recalls (place_id, sent_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_appointments_recall ON wuarike_db.appointments (place_id, service_id, customer_phone, starts_at) WHERE status = 'ATENDIDA'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.idx_appointments_recall`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.whatsapp_opt_outs`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.appointment_recalls`);
    await queryRunner.query(`ALTER TABLE wuarike_db.dishes DROP COLUMN IF EXISTS recall_days, DROP COLUMN IF EXISTS recall_notice_days`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.appointment_reminders`);
  }
}
