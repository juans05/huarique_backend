-- Pagos atascados en PROCESANDO (conciliación). Idempotente: se puede correr más de una vez.
ALTER TABLE wuarike_db.order_payments ADD COLUMN IF NOT EXISTS processing_started_at timestamptz NULL;
