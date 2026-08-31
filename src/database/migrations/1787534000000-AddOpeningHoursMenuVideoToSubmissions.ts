import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOpeningHoursMenuVideoToSubmissions1787534000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.place_submissions
        ADD COLUMN IF NOT EXISTS open_hours_text varchar,
        ADD COLUMN IF NOT EXISTS menu_image_urls jsonb,
        ADD COLUMN IF NOT EXISTS video_url varchar
    `);

    await queryRunner.query(`
      ALTER TABLE wuarike_db.places
        ADD COLUMN IF NOT EXISTS menu_image_urls jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.place_submissions
        DROP COLUMN IF EXISTS open_hours_text,
        DROP COLUMN IF EXISTS menu_image_urls,
        DROP COLUMN IF EXISTS video_url
    `);
    await queryRunner.query(`ALTER TABLE wuarike_db.places DROP COLUMN IF EXISTS menu_image_urls`);
  }
}
