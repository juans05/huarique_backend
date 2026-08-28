import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentUrlsToPlaceClaims1787530000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.place_claims
        ADD COLUMN IF NOT EXISTS document_urls jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.place_claims
        DROP COLUMN IF EXISTS document_urls
    `);
  }
}
