-- Add mode column to conversations table for bot/human operator switching
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS mode VARCHAR(10) DEFAULT 'bot';

-- Create index for mode queries
CREATE INDEX IF NOT EXISTS idx_conversations_mode ON conversations(mode);

-- Update existing conversations to ensure mode is set
UPDATE conversations SET mode = 'bot' WHERE mode IS NULL;
