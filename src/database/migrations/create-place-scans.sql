-- Tabla para registrar escaneos NFC/QR cuando el cliente abre la página del restaurante
-- Ejecutar en Railway junto con create-public-feedback.sql

CREATE TABLE IF NOT EXISTS wuarike_db.place_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id UUID NOT NULL,
    device_id VARCHAR,
    source VARCHAR NOT NULL DEFAULT 'qr' CHECK (source IN ('nfc', 'qr', 'direct')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_place_scans_place_id ON wuarike_db.place_scans(place_id);
CREATE INDEX IF NOT EXISTS idx_place_scans_source ON wuarike_db.place_scans(source);
CREATE INDEX IF NOT EXISTS idx_place_scans_created_at ON wuarike_db.place_scans(created_at DESC);
