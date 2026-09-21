-- AddSuspiciousToCheckins (1787550000000)
--
-- CORRER ESTO ANTES de desplegar el backend: la entidad Checkin ya referencia
-- estas columnas, así que si el código llega primero, toda consulta de
-- check-ins (feed, detalle de local, métricas del negocio) falla.
--
-- Con guards IF NOT EXISTS — seguro de re-correr.

ALTER TABLE wuarike_db.checkins
  ADD COLUMN IF NOT EXISTS is_suspicious boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspicious_reason varchar(200);

-- El feed y las métricas por local filtran por esta columna en cada consulta.
CREATE INDEX IF NOT EXISTS idx_checkins_is_suspicious
  ON wuarike_db.checkins (is_suspicious);
