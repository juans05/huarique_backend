import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWuarikesHereRequestsTable1787542000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE wuarike_db.wuarikes_here_requests_status_enum AS ENUM
      ('nuevo', 'contactado', 'reunion', 'negociacion', 'afiliado', 'no_interesado')
    `);
    await queryRunner.query(`
      CREATE TABLE wuarike_db.wuarikes_here_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        requested_by_user_id uuid NOT NULL,
        restaurant_name varchar NOT NULL,
        address varchar,
        district varchar,
        notes text,
        status wuarike_db.wuarikes_here_requests_status_enum NOT NULL DEFAULT 'nuevo',
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT fk_wuarikes_here_requests_user FOREIGN KEY (requested_by_user_id) REFERENCES wuarike_db.users(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_wuarikes_here_requests_district ON wuarike_db.wuarikes_here_requests (district)`);
    await queryRunner.query(`CREATE INDEX idx_wuarikes_here_requests_status ON wuarike_db.wuarikes_here_requests (status)`);

    // Pipeline comercial para restaurantes ya en la plataforma pero sin reclamar
    // (mismo vocabulario de estados que wuarikes_here_requests, por consistencia).
    await queryRunner.query(`
      ALTER TABLE wuarike_db.places
      ADD COLUMN IF NOT EXISTS commercial_status wuarike_db.wuarikes_here_requests_status_enum
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wuarike_db.places DROP COLUMN IF EXISTS commercial_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.wuarikes_here_requests`);
    await queryRunner.query(`DROP TYPE IF EXISTS wuarike_db.wuarikes_here_requests_status_enum`);
  }
}
