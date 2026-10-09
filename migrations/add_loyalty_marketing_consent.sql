ALTER TABLE wuarike_db.loyalty_cards ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false;
ALTER TABLE wuarike_db.loyalty_cards ADD COLUMN IF NOT EXISTS marketing_consent_at timestamp NULL;
