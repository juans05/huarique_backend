ALTER TABLE wuarike_db.dishes ADD COLUMN IF NOT EXISTS images jsonb;
UPDATE wuarike_db.dishes SET images = jsonb_build_array(image_url) WHERE images IS NULL AND image_url IS NOT NULL;
