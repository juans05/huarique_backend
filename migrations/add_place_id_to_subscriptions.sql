-- Migration: subscriptions become per-place instead of per-user.
-- Ver conversación de diseño: el plan lo compra el dueño, pero antes se resolvía
-- por usuario (un dueño con 2 sedes desbloqueaba ambas con un solo pago). Ahora
-- cada sede tiene su propia suscripción.

BEGIN;

ALTER TABLE wuarike_db.subscriptions
    ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES wuarike_db.places(id) ON DELETE CASCADE;

-- Backfill: cada suscripción existente se asigna a la sede más antigua reclamada
-- por su usuario (en producción hoy solo hay una fila de prueba).
UPDATE wuarike_db.subscriptions s
SET place_id = (
    SELECT p.id FROM wuarike_db.places p
    WHERE p.claimed_by_user_id = s.user_id
    ORDER BY p.created_at ASC
    LIMIT 1
)
WHERE s.place_id IS NULL;

ALTER TABLE wuarike_db.subscriptions
    ALTER COLUMN place_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_place ON wuarike_db.subscriptions (place_id);

-- Una sola suscripción activa por sede a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_place_active
    ON wuarike_db.subscriptions (place_id)
    WHERE status = 'active';

COMMIT;
