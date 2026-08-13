ALTER TABLE wuarike_db.dishes ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE wuarike_db.dishes ADD COLUMN IF NOT EXISTS is_vegetarian BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE wuarike_db.menu_categories ADD COLUMN IF NOT EXISTS category_type VARCHAR(20) NOT NULL DEFAULT 'food';
ALTER TABLE wuarike_db.places ADD COLUMN IF NOT EXISTS logo_url TEXT;
