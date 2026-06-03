import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKnowledgeBaseTables1748800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.knowledge_bases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        file_name varchar NOT NULL,
        file_url varchar NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT fk_knowledge_bases_place FOREIGN KEY (place_id)
          REFERENCES wuarike_db.places(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_bases_place_id
        ON wuarike_db.knowledge_bases(place_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wuarike_db.knowledge_base_chunks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        knowledge_base_id uuid NOT NULL,
        chunk_text text NOT NULL,
        embedding text NOT NULL,
        CONSTRAINT fk_kb_chunks_knowledge_base FOREIGN KEY (knowledge_base_id)
          REFERENCES wuarike_db.knowledge_bases(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_kb_chunks_knowledge_base_id
        ON wuarike_db.knowledge_base_chunks(knowledge_base_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.knowledge_base_chunks`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.knowledge_bases`);
  }
}
