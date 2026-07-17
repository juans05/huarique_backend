-- Adds tiered-plan support to subscriptions.
-- Safe to run multiple times (IF NOT EXISTS).
-- Existing rows get 'reputacion' as the default tier (the lowest/base plan) so
-- they keep working exactly as before until reassigned to a real tier.

ALTER TABLE wuarike_db.subscriptions
  ADD COLUMN IF NOT EXISTS tier VARCHAR NOT NULL DEFAULT 'reputacion';

-- Verify:
-- SELECT column_name, data_type, column_default FROM information_schema.columns
-- WHERE table_schema = 'wuarike_db' AND table_name = 'subscriptions' AND column_name = 'tier';
