-- Create place_scans table for NFC/QR tap tracking
CREATE TABLE IF NOT EXISTS wuarike_db.place_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL,
  device_id UUID,
  source VARCHAR(20) NOT NULL DEFAULT 'qr' CHECK (source IN ('nfc', 'qr', 'direct')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for analytics queries
CREATE INDEX idx_place_scans_place_id ON wuarike_db.place_scans(place_id);
CREATE INDEX idx_place_scans_created_at ON wuarike_db.place_scans(created_at);
CREATE INDEX idx_place_scans_source ON wuarike_db.place_scans(source);
CREATE INDEX idx_place_scans_place_source ON wuarike_db.place_scans(place_id, source);
CREATE INDEX idx_place_scans_place_date ON wuarike_db.place_scans(place_id, created_at);
