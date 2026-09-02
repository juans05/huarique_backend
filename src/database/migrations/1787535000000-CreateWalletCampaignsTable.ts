import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletCampaignsTable1787535000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE wuarike_db.wallet_campaigns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        header varchar NOT NULL,
        body varchar NOT NULL,
        total_queued int NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_wallet_campaigns_place_id ON wuarike_db.wallet_campaigns (place_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.wallet_campaigns`);
  }
}
