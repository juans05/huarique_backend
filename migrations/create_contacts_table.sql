CREATE TABLE IF NOT EXISTS wuarike_db.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
  name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  dni VARCHAR(50),
  custom_fields JSONB,
  source VARCHAR(20) NOT NULL DEFAULT 'import' CHECK (source IN ('whatsapp', 'feedback', 'import')),
  import_batch_id VARCHAR(255),
  tags JSONB,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  last_contacted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_place_id ON wuarike_db.contacts(place_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON wuarike_db.contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON wuarike_db.contacts(source);
