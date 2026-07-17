-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION TEST SCRIPT
-- Execute migrations and verify they work correctly
-- Run this in Railway PostgreSQL console
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Create public_feedback table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wuarike_db.public_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  customer_name VARCHAR(255),
  customer_contact VARCHAR(255),
  device_id UUID,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'contacted')),
  resolved_at TIMESTAMP,
  admin_notes TEXT,
  marketing_consent BOOLEAN DEFAULT FALSE,
  consent_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for public_feedback
CREATE INDEX IF NOT EXISTS idx_public_feedback_place_id ON wuarike_db.public_feedback(place_id);
CREATE INDEX IF NOT EXISTS idx_public_feedback_created_at ON wuarike_db.public_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_public_feedback_rating ON wuarike_db.public_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_public_feedback_place_rating ON wuarike_db.public_feedback(place_id, rating);
CREATE INDEX IF NOT EXISTS idx_public_feedback_status ON wuarike_db.public_feedback(status);
CREATE INDEX IF NOT EXISTS idx_public_feedback_place_status ON wuarike_db.public_feedback(place_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Create place_scans table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wuarike_db.place_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL,
  device_id UUID,
  source VARCHAR(20) NOT NULL DEFAULT 'qr' CHECK (source IN ('nfc', 'qr', 'direct')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for place_scans
CREATE INDEX IF NOT EXISTS idx_place_scans_place_id ON wuarike_db.place_scans(place_id);
CREATE INDEX IF NOT EXISTS idx_place_scans_created_at ON wuarike_db.place_scans(created_at);
CREATE INDEX IF NOT EXISTS idx_place_scans_source ON wuarike_db.place_scans(source);
CREATE INDEX IF NOT EXISTS idx_place_scans_place_source ON wuarike_db.place_scans(place_id, source);
CREATE INDEX IF NOT EXISTS idx_place_scans_place_date ON wuarike_db.place_scans(place_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Check if tables exist and show structure
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'wuarike_db'
AND table_name IN ('public_feedback', 'place_scans');

-- Show columns for public_feedback
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'wuarike_db' AND table_name = 'public_feedback'
ORDER BY ordinal_position;

-- Show columns for place_scans
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'wuarike_db' AND table_name = 'place_scans'
ORDER BY ordinal_position;

-- Show indexes for public_feedback
SELECT indexname FROM pg_indexes
WHERE schemaname = 'wuarike_db' AND tablename = 'public_feedback';

-- Show indexes for place_scans
SELECT indexname FROM pg_indexes
WHERE schemaname = 'wuarike_db' AND tablename = 'place_scans';

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEST INSERT (use a real place_id from your database)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Test insert to public_feedback (replace place_id with a real one from your DB)
INSERT INTO wuarike_db.public_feedback (
  place_id,
  rating,
  comment,
  customer_name,
  customer_contact,
  marketing_consent,
  status
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000'::UUID, -- REPLACE WITH REAL PLACE_ID
  5,
  'Test feedback - Everything works!',
  'Test Customer',
  '+51987654321',
  true,
  'pending'
) RETURNING id, created_at;

-- Test insert to place_scans (replace place_id with a real one from your DB)
INSERT INTO wuarike_db.place_scans (
  place_id,
  device_id,
  source
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000'::UUID, -- REPLACE WITH REAL PLACE_ID
  NULL,
  'nfc'
) RETURNING id, source, created_at;

-- Verify test data was inserted
SELECT COUNT(*) as feedback_count FROM wuarike_db.public_feedback;
SELECT COUNT(*) as scans_count FROM wuarike_db.place_scans;

-- Show recent data
SELECT id, place_id, rating, status, created_at FROM wuarike_db.public_feedback ORDER BY created_at DESC LIMIT 5;
SELECT id, place_id, source, created_at FROM wuarike_db.place_scans ORDER BY created_at DESC LIMIT 5;
