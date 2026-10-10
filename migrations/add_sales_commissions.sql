-- Comisiones para comerciales (spec 2026-10-09). Idempotente: se puede correr más de una vez.
ALTER TABLE wuarike_db.places ADD COLUMN IF NOT EXISTS assigned_sales_user_id uuid NULL REFERENCES wuarike_db.users(id) ON DELETE SET NULL;
ALTER TABLE wuarike_db.places ADD COLUMN IF NOT EXISTS sales_assigned_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS idx_places_assigned_sales_user ON wuarike_db.places(assigned_sales_user_id);

ALTER TABLE wuarike_db.subscriptions ADD COLUMN IF NOT EXISTS sales_user_id uuid NULL REFERENCES wuarike_db.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS wuarike_db.commission_settings (
  id int PRIMARY KEY,
  first_month_rate numeric(5,4) NOT NULL,
  recurring_rate numeric(5,4) NOT NULL,
  recurring_months int NOT NULL,
  clawback_days int NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid NULL
);
INSERT INTO wuarike_db.commission_settings (id, first_month_rate, recurring_rate, recurring_months, clawback_days)
VALUES (1, 0.7000, 0.1000, 6, 30)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS wuarike_db.commission_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_user_id uuid NOT NULL REFERENCES wuarike_db.users(id),
  period varchar(7) NOT NULL,
  total_amount int NOT NULL,
  status varchar NOT NULL DEFAULT 'pending',
  paid_at timestamptz NULL,
  paid_by_user_id uuid NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_sales_user ON wuarike_db.commission_payouts(sales_user_id);

CREATE TABLE IF NOT EXISTS wuarike_db.commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_user_id uuid NOT NULL REFERENCES wuarike_db.users(id),
  place_id uuid NOT NULL REFERENCES wuarike_db.places(id),
  subscription_id uuid NOT NULL REFERENCES wuarike_db.subscriptions(id),
  payment_id uuid NOT NULL REFERENCES wuarike_db.subscription_payments(id),
  type varchar NOT NULL,
  month_number int NOT NULL,
  base_amount int NOT NULL,
  rate numeric(5,4) NOT NULL,
  amount int NOT NULL,
  -- Anular una liquidación pendiente = borrarla; sus líneas quedan libres solas.
  payout_id uuid NULL REFERENCES wuarike_db.commission_payouts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_commission_entries_payment_type UNIQUE (payment_id, type)
);
CREATE INDEX IF NOT EXISTS idx_commission_entries_sales_payout ON wuarike_db.commission_entries(sales_user_id, payout_id);
CREATE INDEX IF NOT EXISTS idx_commission_entries_subscription ON wuarike_db.commission_entries(subscription_id);
