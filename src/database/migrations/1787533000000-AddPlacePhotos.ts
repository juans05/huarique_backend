import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlacePhotos1787533000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wuarike_db.place_submissions
        ADD COLUMN IF NOT EXISTS photo_urls jsonb
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.place_photos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        url varchar NOT NULL,
        place_id uuid NOT NULL,
        user_id uuid NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT fk_place_photos_place FOREIGN KEY (place_id)
          REFERENCES wuarike_db.places(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_place_photos_place_id ON wuarike_db.place_photos(place_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_place_photos_user_id ON wuarike_db.place_photos(user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.place_photos`);
    await queryRunner.query(`ALTER TABLE wuarike_db.place_submissions DROP COLUMN IF EXISTS photo_urls`);
  }
}
