-- Structured opening hours (replaces the free-text openHoursText heuristic parsing on the frontend)
ALTER TABLE wuarike_db.places
    ADD COLUMN IF NOT EXISTS opening_hours JSONB;

-- Dish allergens / ingredients / availability
ALTER TABLE wuarike_db.dishes
    ADD COLUMN IF NOT EXISTS allergens JSONB,
    ADD COLUMN IF NOT EXISTS ingredients JSONB,
    ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true;

-- Promotions visible on a place's page
CREATE TABLE IF NOT EXISTS wuarike_db.promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id UUID NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    image_url TEXT,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promotions_place_id ON wuarike_db.promotions(place_id);
