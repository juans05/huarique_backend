ALTER TABLE wuarike_db.messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE wuarike_db.messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(100);
