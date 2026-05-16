-- Migration: Add device_id to public_feedback table
-- Description: Link feedback to specific devices (zones) for analytics by location

BEGIN;

-- Add device_id column to public_feedback table
ALTER TABLE wuarike_db.public_feedback
ADD COLUMN device_id UUID NULL DEFAULT NULL;

-- Create index for faster queries by device
CREATE INDEX idx_public_feedback_device_id ON wuarike_db.public_feedback(device_id);

-- Create composite index for place + device queries
CREATE INDEX idx_public_feedback_place_device ON wuarike_db.public_feedback(place_id, device_id);

COMMIT;
