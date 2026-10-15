-- Cobro en mesa por el mozo (idempotente).
-- 1) Interruptor: el comensal puede (true) o no (false) pagar la cuenta de mesa desde su celular.
ALTER TABLE wuarike_db.place_order_settings
    ADD COLUMN IF NOT EXISTS table_online_payment_enabled boolean NOT NULL DEFAULT true;

-- 2) Roles de equipo: agrega 'mozo' (y 'cocina', que faltaba en el CHECK original de add_team_management.sql).
ALTER TABLE wuarike_db.place_team_members DROP CONSTRAINT IF EXISTS place_team_members_role_check;
ALTER TABLE wuarike_db.place_team_members
    ADD CONSTRAINT place_team_members_role_check CHECK (role IN ('admin', 'supervisor', 'agente', 'mozo', 'cocina'));
