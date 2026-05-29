import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlazbotTables1726570800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "restaurant_documents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "type" varchar NOT NULL,
        "title" varchar NOT NULL,
        "content" text NOT NULL,
        "tags" text[],
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_restaurant_documents_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_restaurant_documents_user_type" ON "restaurant_documents" ("userId", "type")
    `);

    await queryRunner.query(`
      CREATE TABLE "document_embeddings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "documentId" uuid NOT NULL,
        "chunk" text NOT NULL,
        "embedding" float8[] NOT NULL,
        "chunkIndex" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_document_embeddings_document" FOREIGN KEY ("documentId") REFERENCES "restaurant_documents"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_document_embeddings_user_document" ON "document_embeddings" ("userId", "documentId")
    `);

    await queryRunner.query(`
      CREATE TABLE "tenant_plazbot_configs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL UNIQUE,
        "plazBotApiKey" varchar NOT NULL,
        "plazBotWorkspaceId" varchar NOT NULL,
        "agentId" varchar NOT NULL,
        "plazBotContactGroupId" varchar,
        "systemPrompt" text,
        "tone" varchar NOT NULL DEFAULT 'professional',
        "isActive" boolean NOT NULL DEFAULT true,
        "connectedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_tenant_plazbot_configs_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_tenant_plazbot_configs_workspace" ON "tenant_plazbot_configs" ("plazBotWorkspaceId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_tenant_plazbot_configs_workspace"`);
    await queryRunner.query(`DROP TABLE "tenant_plazbot_configs"`);

    await queryRunner.query(`DROP INDEX "idx_document_embeddings_user_document"`);
    await queryRunner.query(`DROP TABLE "document_embeddings"`);

    await queryRunner.query(`DROP INDEX "idx_restaurant_documents_user_type"`);
    await queryRunner.query(`DROP TABLE "restaurant_documents"`);
  }
}
