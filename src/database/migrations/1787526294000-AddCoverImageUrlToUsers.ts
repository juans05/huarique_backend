import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCoverImageUrlToUsers1787526294000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.users
        ADD COLUMN IF NOT EXISTS cover_image_url varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.users
        DROP COLUMN IF EXISTS cover_image_url
    `);
  }
}
