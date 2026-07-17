-- Create public_feedback table for NFC/QR feedback collection
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

-- Create indexes for common queries
CREATE INDEX idx_public_feedback_place_id ON wuarike_db.public_feedback(place_id);
CREATE INDEX idx_public_feedback_created_at ON wuarike_db.public_feedback(created_at);
CREATE INDEX idx_public_feedback_rating ON wuarike_db.public_feedback(rating);
CREATE INDEX idx_public_feedback_place_rating ON wuarike_db.public_feedback(place_id, rating);
CREATE INDEX idx_public_feedback_status ON wuarike_db.public_feedback(status);
CREATE INDEX idx_public_feedback_place_status ON wuarike_db.public_feedback(place_id, status);
