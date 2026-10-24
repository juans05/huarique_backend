import { MigrationInterface, QueryRunner } from 'typeorm';

// Perfiles del equipo de cada negocio: un nivel base (cocina..supervisor) y las secciones que ve. Sin perfil, todo sigue como hoy.
export class PerfilesEquipo1787650000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.place_team_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
        name varchar(60) NOT NULL,
        base_role varchar(20) NOT NULL,
        modules text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (place_id, name)
      )
    `);
    await queryRunner.query(`ALTER TABLE wuarike_db.place_team_members ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES wuarike_db.place_team_profiles(id) ON DELETE SET NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.place_team_members DROP COLUMN IF EXISTS profile_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.place_team_profiles`);
  }
}
