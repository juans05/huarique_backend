CREATE TABLE IF NOT EXISTS wuarike_db.bot_menu_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
  display_order INT NOT NULL,
  label VARCHAR(255) NOT NULL,
  action_type VARCHAR(20) NOT NULL,
  action_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bot_menu_options_place_id ON wuarike_db.bot_menu_options(place_id);
