-- Tabla para almacenar feedback público de clientes (quejas y reseñas privadas)
-- Ejecutar en Railway con: psql $DATABASE_URL -c "$(cat create-public-feedback.sql)"

CREATE TABLE IF NOT EXISTS wuarike_db.public_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id UUID NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    customer_name VARCHAR,
    customer_contact VARCHAR,
    device_id VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'contacted')),
    resolved_at TIMESTAMP,
    admin_notes TEXT,
    marketing_consent BOOLEAN NOT NULL DEFAULT false,
    consent_timestamp TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_feedback_place_id ON wuarike_db.public_feedback(place_id);
CREATE INDEX IF NOT EXISTS idx_public_feedback_rating ON wuarike_db.public_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_public_feedback_status ON wuarike_db.public_feedback(status);
CREATE INDEX IF NOT EXISTS idx_public_feedback_created_at ON wuarike_db.public_feedback(created_at DESC);
