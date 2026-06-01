-- Run this in Railway's PostgreSQL console

CREATE TABLE IF NOT EXISTS wuarike_db.menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    place_id UUID NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE wuarike_db.dishes
    ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES wuarike_db.menu_categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
