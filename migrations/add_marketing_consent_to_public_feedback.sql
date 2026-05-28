-- Migration: Add marketing_consent and consent_timestamp to public_feedback table
-- Description: Track customer consent for marketing emails and personalized ads

BEGIN;

ALTER TABLE wuarike_db.public_feedback
ADD COLUMN marketing_consent BOOLEAN DEFAULT FALSE,
ADD COLUMN consent_timestamp TIMESTAMP WITHOUT TIME ZONE NULL;

CREATE INDEX idx_public_feedback_marketing_consent ON wuarike_db.public_feedback(marketing_consent)
WHERE marketing_consent = TRUE;

CREATE INDEX idx_public_feedback_consent_timestamp ON wuarike_db.public_feedback(consent_timestamp)
WHERE consent_timestamp IS NOT NULL;

COMMIT;
