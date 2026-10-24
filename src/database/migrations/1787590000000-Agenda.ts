import { MigrationInterface, QueryRunner } from 'typeorm';

// Agenda de citas por profesional (rubros de servicios): profesionales con su silla y horario, citas y borrador del bot.
export class Agenda1787590000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.place_professionals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        name varchar(80) NOT NULL,
        photo_url varchar(500),
        station varchar(40),
        service_ids uuid[] NOT NULL DEFAULT '{}',
        schedule jsonb,
        days_off date[] NOT NULL DEFAULT '{}',
        team_user_id uuid,
        active boolean NOT NULL DEFAULT true,
        display_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_professionals_place ON wuarike_db.place_professionals (place_id)`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.appointments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        professional_id uuid NOT NULL REFERENCES wuarike_db.place_professionals(id),
        service_id uuid,
        service_name varchar(150) NOT NULL,
        duration_min int NOT NULL,
        price int NOT NULL DEFAULT 0,
        starts_at timestamptz NOT NULL,
        ends_at timestamptz NOT NULL,
        customer_name varchar(120) NOT NULL,
        customer_phone varchar(30),
        notes varchar(300),
        status varchar(12) NOT NULL DEFAULT 'RESERVADA',
        source varchar(6) NOT NULL DEFAULT 'PANEL',
        public_token varchar(32) NOT NULL UNIQUE,
        created_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_appointments_pro_start ON wuarike_db.appointments (professional_id, starts_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_appointments_place_start ON wuarike_db.appointments (place_id, starts_at)`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.appointment_drafts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        customer_phone varchar(30) NOT NULL,
        service_id uuid,
        professional_id varchar(36),
        date varchar(10),
        time varchar(5),
        status varchar(12) NOT NULL DEFAULT 'ARMANDO',
        appointment_id uuid,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_appointment_drafts_phone ON wuarike_db.appointment_drafts (place_id, customer_phone)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.appointment_drafts`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.appointments`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.place_professionals`);
  }
}
