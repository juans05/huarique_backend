ALTER TABLE wuarike_db.whatsapp_numbers ADD COLUMN IF NOT EXISTS provider varchar(10) NOT NULL DEFAULT 'plazbot';
ALTER TABLE wuarike_db.whatsapp_numbers ADD COLUMN IF NOT EXISTS waba_id varchar;
