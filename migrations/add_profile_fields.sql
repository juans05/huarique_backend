-- Migration: Add profile fields to users table
-- Date: 2026-01-03

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS pronouns VARCHAR(50),
ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Create index for better query performance (optional)
CREATE INDEX IF NOT EXISTS idx_users_birth_date ON users(birth_date);
