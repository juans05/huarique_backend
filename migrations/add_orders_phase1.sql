-- Pedidos Fase 1 (spec 2026-10-14). Idempotente: se puede correr más de una vez.
CREATE TABLE IF NOT EXISTS wuarike_db.place_order_settings (
  place_id uuid PRIMARY KEY REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
  orders_enabled boolean NOT NULL DEFAULT false,
  table_payment_mode varchar(20) NOT NULL DEFAULT 'CUENTA_ABIERTA',   -- CUENTA_ABIERTA | PREPAGO
  payment_destination varchar(20) NOT NULL DEFAULT 'LOCAL',       -- LOCAL | WUARIKES
  culqi_public_key varchar(120) NULL,
  culqi_secret_key_enc text NULL,
  pickup_enabled boolean NOT NULL DEFAULT true,
  delivery_enabled boolean NOT NULL DEFAULT false,
  delivery_fee int NOT NULL DEFAULT 0,
  delivery_note text NULL,
  prep_time_min int NOT NULL DEFAULT 20,
  prices_include_igv boolean NOT NULL DEFAULT true,
  cash_payment_enabled boolean NOT NULL DEFAULT true,
  wuarikes_commission_pct numeric(5,4) NOT NULL DEFAULT 0.0500,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wuarike_db.place_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
  name varchar(40) NOT NULL,
  capacity int NOT NULL DEFAULT 4,
  display_order int NOT NULL DEFAULT 0,
  qr_token varchar(64) NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_place_tables_place ON wuarike_db.place_tables(place_id);

-- Correlativo #pedido por local, atómico con INSERT ... ON CONFLICT ... RETURNING.
CREATE TABLE IF NOT EXISTS wuarike_db.place_order_counters (
  place_id uuid PRIMARY KEY REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
  last_number int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wuarike_db.tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES wuarike_db.place_tables(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'ABIERTA',   -- ABIERTA | CUENTA_PEDIDA | PAGADA | CERRADA
  public_token varchar(64) NOT NULL UNIQUE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  bill_requested_at timestamptz NULL,
  closed_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS idx_tabs_place_status ON wuarike_db.tabs(place_id, status);
-- A lo sumo una cuenta viva (no cerrada) por mesa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tabs_live_per_table ON wuarike_db.tabs(table_id) WHERE status IN ('ABIERTA', 'CUENTA_PEDIDA', 'PAGADA');

CREATE TABLE IF NOT EXISTS wuarike_db.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number int NOT NULL,
  place_id uuid NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
  tab_id uuid NULL REFERENCES wuarike_db.tabs(id) ON DELETE SET NULL,
  table_id uuid NULL REFERENCES wuarike_db.place_tables(id) ON DELETE SET NULL,
  channel varchar(20) NOT NULL,        -- MESA | WHATSAPP
  fulfillment varchar(20) NOT NULL,    -- SALA | RECOJO | DELIVERY
  status varchar(20) NOT NULL,         -- PENDIENTE_PAGO | NUEVO | EN_PREPARACION | LISTO | ENTREGADO | CANCELADO
  customer_name varchar(120) NULL,
  customer_phone varchar(30) NULL,
  whatsapp_number_id uuid NULL,
  delivery_address text NULL,
  delivery_reference text NULL,
  subtotal int NOT NULL,
  delivery_fee int NOT NULL DEFAULT 0,
  total int NOT NULL,
  notes text NULL,
  public_token varchar(64) NOT NULL UNIQUE,
  paid_at timestamptz NULL,
  ready_at timestamptz NULL,
  delivered_at timestamptz NULL,
  canceled_at timestamptz NULL,
  cancel_reason text NULL,
  refund_pending boolean NOT NULL DEFAULT false,
  review_requested_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, number)
);
CREATE INDEX IF NOT EXISTS idx_orders_place_status ON wuarike_db.orders(place_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_place_created ON wuarike_db.orders(place_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_tab ON wuarike_db.orders(tab_id);

CREATE TABLE IF NOT EXISTS wuarike_db.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES wuarike_db.orders(id) ON DELETE CASCADE,
  dish_id uuid NULL REFERENCES wuarike_db.dishes(id) ON DELETE SET NULL,
  dish_name_snapshot varchar(200) NOT NULL,
  unit_price int NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0),
  note varchar(200) NULL,
  line_total int NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON wuarike_db.order_items(order_id);

CREATE TABLE IF NOT EXISTS wuarike_db.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
  order_id uuid NULL REFERENCES wuarike_db.orders(id) ON DELETE SET NULL,
  tab_id uuid NULL REFERENCES wuarike_db.tabs(id) ON DELETE SET NULL,
  method varchar(20) NOT NULL,         -- ONLINE (aún sin medio) | TARJETA | YAPE | PAGOEFECTIVO | EFECTIVO | POS
  amount int NOT NULL,
  status varchar(20) NOT NULL,         -- PENDIENTE | PAGADO | FALLIDO | EXPIRADO
  destination varchar(20) NOT NULL,    -- LOCAL | WUARIKES
  customer_email varchar(160) NULL,
  culqi_charge_id varchar(80) NULL UNIQUE,
  culqi_order_id varchar(80) NULL UNIQUE,
  culqi_fee int NOT NULL DEFAULT 0,
  expires_at timestamptz NULL,
  paid_at timestamptz NULL,
  recorded_by_user_id uuid NULL,
  payout_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((order_id IS NULL) <> (tab_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_order_payments_status ON wuarike_db.order_payments(status);
CREATE INDEX IF NOT EXISTS idx_order_payments_place ON wuarike_db.order_payments(place_id, paid_at);

CREATE TABLE IF NOT EXISTS wuarike_db.place_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
  period varchar(7) NOT NULL,          -- YYYY-MM (hora de Lima)
  gross int NOT NULL,
  commission int NOT NULL,
  culqi_fees int NOT NULL,
  net int NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'BORRADOR',   -- BORRADOR | PAGADO | ANULADO
  paid_at timestamptz NULL,
  reference varchar(120) NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_place_payouts_place ON wuarike_db.place_payouts(place_id, period);

CREATE TABLE IF NOT EXISTS wuarike_db.whatsapp_order_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
  customer_phone varchar(30) NOT NULL,
  whatsapp_number_id uuid NULL,
  items_json jsonb NOT NULL DEFAULT '[]',
  fulfillment varchar(20) NULL,
  delivery_address text NULL,
  status varchar(20) NOT NULL DEFAULT 'ARMANDO',    -- ARMANDO | CONFIRMADO | EXPIRADO
  order_id uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_drafts_lookup ON wuarike_db.whatsapp_order_drafts(place_id, customer_phone, status);
