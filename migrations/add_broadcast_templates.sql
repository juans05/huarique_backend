ALTER TABLE wuarike_db.broadcasts ADD COLUMN IF NOT EXISTS template_name varchar;
ALTER TABLE wuarike_db.broadcasts ADD COLUMN IF NOT EXISTS template_language varchar NOT NULL DEFAULT 'es';
ALTER TABLE wuarike_db.broadcasts ADD COLUMN IF NOT EXISTS body_variables jsonb;
ALTER TABLE wuarike_db.broadcasts ADD COLUMN IF NOT EXISTS total_recipients integer NOT NULL DEFAULT 0;
ALTER TABLE wuarike_db.broadcasts ADD COLUMN IF NOT EXISTS messages_failed integer NOT NULL DEFAULT 0;
