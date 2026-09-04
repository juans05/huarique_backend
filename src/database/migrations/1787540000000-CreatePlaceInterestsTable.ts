import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlaceInterestsTable1787540000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE wuarike_db.place_interests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        place_id uuid NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT uq_place_interests_user_place UNIQUE (user_id, place_id),
        CONSTRAINT fk_place_interests_user FOREIGN KEY (user_id) REFERENCES wuarike_db.users(id) ON DELETE CASCADE,
        CONSTRAINT fk_place_interests_place FOREIGN KEY (place_id) REFERENCES wuarike_db.places(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_place_interests_place_id ON wuarike_db.place_interests (place_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.place_interests`);
  }
}
