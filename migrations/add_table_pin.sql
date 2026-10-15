-- PIN de mesa (Pedidos): se renueva solo al pagar la cuenta completa o al cerrar la mesa. Idempotente.
ALTER TABLE wuarike_db.place_tables ADD COLUMN IF NOT EXISTS pin varchar(4) NULL;
UPDATE wuarike_db.place_tables SET pin = lpad((floor(random() * 10000))::int::text, 4, '0') WHERE pin IS NULL;
