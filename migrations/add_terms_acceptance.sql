-- Prueba de aceptación de Términos y Condiciones (versión, fecha e IP). Idempotente.
ALTER TABLE wuarike_db.users ADD COLUMN IF NOT EXISTS terms_version_accepted varchar(20) NULL;
ALTER TABLE wuarike_db.users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz NULL;
ALTER TABLE wuarike_db.users ADD COLUMN IF NOT EXISTS terms_accepted_ip varchar(64) NULL;
