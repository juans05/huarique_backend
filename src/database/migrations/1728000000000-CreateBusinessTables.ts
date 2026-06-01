import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBusinessTables1728000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Contacts
    await queryRunner.query(`
      CREATE TABLE wuarike_db.contacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        name varchar,
        phone varchar,
        email varchar,
        custom_fields jsonb,
        source varchar NOT NULL DEFAULT 'import',
        import_batch_id uuid,
        tags jsonb,
        marketing_consent boolean NOT NULL DEFAULT false,
        last_contacted_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT fk_contacts_place FOREIGN KEY (place_id) REFERENCES wuarike_db.places(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_contacts_place_id ON wuarike_db.contacts(place_id)`);
    await queryRunner.query(`CREATE INDEX idx_contacts_phone ON wuarike_db.contacts(phone)`);
    await queryRunner.query(`CREATE INDEX idx_contacts_source ON wuarike_db.contacts(source)`);

    // Contact imports
    await queryRunner.query(`
      CREATE TABLE wuarike_db.contact_imports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        filename varchar NOT NULL,
        total_rows integer NOT NULL DEFAULT 0,
        imported_rows integer NOT NULL DEFAULT 0,
        failed_rows integer NOT NULL DEFAULT 0,
        error_log jsonb,
        column_mapping jsonb,
        status varchar NOT NULL DEFAULT 'processing',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT fk_contact_imports_place FOREIGN KEY (place_id) REFERENCES wuarike_db.places(id) ON DELETE CASCADE
      )
    `);

    // Extend broadcasts with merge & scheduling fields
    await queryRunner.query(`ALTER TABLE wuarike_db.broadcasts ADD COLUMN IF NOT EXISTS csv_import_id uuid`);
    await queryRunner.query(`ALTER TABLE wuarike_db.broadcasts ADD COLUMN IF NOT EXISTS use_csv_merge boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE wuarike_db.broadcasts ADD COLUMN IF NOT EXISTS merge_mapping jsonb`);
    await queryRunner.query(`ALTER TABLE wuarike_db.broadcasts ADD COLUMN IF NOT EXISTS scheduled_at timestamp`);
    await queryRunner.query(`ALTER TABLE wuarike_db.broadcasts ADD COLUMN IF NOT EXISTS timezone varchar NOT NULL DEFAULT 'America/Lima'`);

    // Audit logs
    await queryRunner.query(`
      CREATE TABLE wuarike_db.audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid,
        user_id uuid,
        action varchar NOT NULL,
        entity_type varchar,
        entity_id uuid,
        metadata jsonb,
        ip_address varchar,
        description varchar,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_audit_logs_place_created ON wuarike_db.audit_logs(place_id, created_at)`);
    await queryRunner.query(`CREATE INDEX idx_audit_logs_action ON wuarike_db.audit_logs(action)`);
    await queryRunner.query(`CREATE INDEX idx_audit_logs_entity ON wuarike_db.audit_logs(entity_type, entity_id)`);
    await queryRunner.query(`CREATE INDEX idx_audit_logs_place_id ON wuarike_db.audit_logs(place_id)`);

    // Credit balances
    await queryRunner.query(`
      CREATE TABLE wuarike_db.credit_balances (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL UNIQUE,
        balance integer NOT NULL DEFAULT 0,
        total_purchased integer NOT NULL DEFAULT 0,
        total_used integer NOT NULL DEFAULT 0,
        alert_threshold integer NOT NULL DEFAULT 100,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT fk_credit_balances_place FOREIGN KEY (place_id) REFERENCES wuarike_db.places(id) ON DELETE CASCADE
      )
    `);

    // Credit transactions
    await queryRunner.query(`
      CREATE TABLE wuarike_db.credit_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id uuid NOT NULL,
        type varchar NOT NULL,
        amount integer NOT NULL,
        balance_after integer,
        reference_type varchar,
        reference_id uuid,
        description varchar,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_credit_transactions_place_created ON wuarike_db.credit_transactions(place_id, created_at)`);
    await queryRunner.query(`CREATE INDEX idx_credit_transactions_place_id ON wuarike_db.credit_transactions(place_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.idx_credit_transactions_place_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.idx_credit_transactions_place_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.credit_transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.credit_balances`);

    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.idx_audit_logs_place_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.idx_audit_logs_entity`);
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.idx_audit_logs_action`);
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.idx_audit_logs_place_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.audit_logs`);

    await queryRunner.query(`ALTER TABLE wuarike_db.broadcasts DROP COLUMN IF EXISTS timezone`);
    await queryRunner.query(`ALTER TABLE wuarike_db.broadcasts DROP COLUMN IF EXISTS scheduled_at`);
    await queryRunner.query(`ALTER TABLE wuarike_db.broadcasts DROP COLUMN IF EXISTS merge_mapping`);
    await queryRunner.query(`ALTER TABLE wuarike_db.broadcasts DROP COLUMN IF EXISTS use_csv_merge`);
    await queryRunner.query(`ALTER TABLE wuarike_db.broadcasts DROP COLUMN IF EXISTS csv_import_id`);

    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.contact_imports`);
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.idx_contacts_source`);
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.idx_contacts_phone`);
    await queryRunner.query(`DROP INDEX IF EXISTS wuarike_db.idx_contacts_place_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS wuarike_db.contacts`);
  }
}
