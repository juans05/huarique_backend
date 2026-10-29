-- Reputación Fase 1 (spec 2026-10-14-seo-reputacion). Idempotente: se puede correr más de una vez.
ALTER TABLE wuarike_db.devices ADD COLUMN IF NOT EXISTS team_member_id uuid NULL
  REFERENCES wuarike_db.place_team_members(id) ON DELETE SET NULL;
ALTER TABLE wuarike_db.devices ADD COLUMN IF NOT EXISTS weekly_goal int NULL
  CHECK (weekly_goal BETWEEN 1 AND 500);

CREATE TABLE IF NOT EXISTS wuarike_db.review_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
  review_name varchar(300) NULL,          -- accounts/{a}/locations/{l}/reviews/{r}; NULL en sugerencias
  stars int NOT NULL,
  origin varchar(20) NOT NULL,            -- sugerencia | auto | lote
  status varchar(20) NOT NULL,            -- sugerida | programada | publicada | cancelada | sin_cupo | error
  ai_generated boolean NOT NULL DEFAULT false,
  reply_text text NULL,
  scheduled_at timestamptz NULL,
  published_at timestamptz NULL,
  attempts int NOT NULL DEFAULT 0,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_replies_place_created ON wuarike_db.review_replies(place_id, created_at);
CREATE INDEX IF NOT EXISTS idx_review_replies_due ON wuarike_db.review_replies(place_id, scheduled_at) WHERE status = 'programada';
-- Nunca dos respuestas automáticas vivas sobre la misma reseña.
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_replies_auto_live ON wuarike_db.review_replies(place_id, review_name)
  WHERE origin IN ('auto', 'lote') AND status IN ('programada', 'publicada');
