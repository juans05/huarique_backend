import { MigrationInterface, QueryRunner } from 'typeorm';

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export class CreatePlatformSettingsTable1787532000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE wuarike_db.platform_settings (
        id uuid PRIMARY KEY,
        contact_email varchar,
        contact_phone varchar,
        contact_address varchar,
        social_instagram varchar,
        social_facebook varchar,
        social_tiktok varchar,
        social_x varchar,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO wuarike_db.platform_settings (id, contact_email, contact_phone, contact_address)
      VALUES ($1, 'consulta@wuarikes.com', '+51 902 191 948', 'Lima, Perú')
    `, [SETTINGS_ID]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.platform_settings`);
  }
}
