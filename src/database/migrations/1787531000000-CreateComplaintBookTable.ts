import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateComplaintBookTable1787531000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE wuarike_db.complaint_book_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sequence_number bigserial,
        type varchar NOT NULL,
        consumer_full_name varchar NOT NULL,
        consumer_document_type varchar NOT NULL,
        consumer_document_number varchar NOT NULL,
        consumer_address varchar NOT NULL,
        consumer_email varchar NOT NULL,
        consumer_phone varchar,
        contracted_good text NOT NULL,
        claimed_amount numeric(10, 2),
        detail text NOT NULL,
        consumer_request text NOT NULL,
        status varchar NOT NULL DEFAULT 'pending',
        provider_response text,
        responded_by_admin_id uuid,
        responded_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_complaint_book_entries_status ON wuarike_db.complaint_book_entries(status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.complaint_book_entries`);
  }
}
