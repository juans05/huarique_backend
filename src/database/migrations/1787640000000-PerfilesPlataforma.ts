import { MigrationInterface, QueryRunner } from 'typeorm';

// Perfiles y permisos del equipo de Wuarikes. Los admins y comerciales actuales reciben su perfil de fábrica; sin perfil, un admin no tiene acceso.
export class PerfilesPlataforma1787640000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.platform_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(60) NOT NULL UNIQUE,
        description varchar(200),
        permissions text[] NOT NULL DEFAULT '{}',
        is_system boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`ALTER TABLE wuarike_db.users ADD COLUMN IF NOT EXISTS platform_profile_id uuid REFERENCES wuarike_db.platform_profiles(id) ON DELETE SET NULL`);
    const profiles: [string, string, string[]][] = [
      ['Administrador', 'Acceso total a la plataforma', ['*']],
      ['Comercial', 'Sus locales, oportunidades y comisiones', ['locales.ver', 'oportunidades.propias', 'comisiones.propias', 'suscripciones.link']],
      ['Moderador', 'Control de locales, reclamaciones y QR', ['locales.ver', 'locales.gestionar', 'reclamaciones.gestionar', 'qr.gestionar']],
      ['Finanzas', 'Suscripciones, liquidaciones y comisiones', ['locales.ver', 'suscripciones.ver', 'comisiones.todas', 'liquidaciones.gestionar']],
      ['Soporte', 'Usuarios y bot de WhatsApp', ['locales.ver', 'usuarios.ver', 'usuarios.gestionar', 'whatsapp.gestionar']],
    ];
    for (const [name, description, permissions] of profiles) {
      await queryRunner.query(
        `INSERT INTO wuarike_db.platform_profiles (name, description, permissions, is_system) VALUES ($1, $2, $3, true) ON CONFLICT (name) DO NOTHING`,
        [name, description, permissions],
      );
    }
    for (const [role, name] of [['admin', 'Administrador'], ['sales', 'Comercial']]) {
      await queryRunner.query(
        `UPDATE wuarike_db.users SET platform_profile_id = (SELECT id FROM wuarike_db.platform_profiles WHERE name = $2) WHERE role = $1 AND platform_profile_id IS NULL`,
        [role, name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.users DROP COLUMN IF EXISTS platform_profile_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.platform_profiles`);
  }
}
