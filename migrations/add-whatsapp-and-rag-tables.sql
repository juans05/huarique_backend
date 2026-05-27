-- Crear tablas de base de datos correspondientes a las entidades
CREATE TABLE IF NOT EXISTS whatsapp_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    phone_number VARCHAR(50) NOT NULL,
    phone_number_id VARCHAR(100) NOT NULL,
    whatsapp_api_token TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    verification_status VARCHAR(50) DEFAULT 'UNVERIFIED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    customer_phone VARCHAR(50) NOT NULL,
    customer_name VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_type VARCHAR(20) NOT NULL,
    message_body TEXT NOT NULL,
    is_from_ai BOOLEAN DEFAULT FALSE,
    whatsapp_message_id VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    whatsapp_number_id UUID NOT NULL REFERENCES whatsapp_numbers(id),
    campaign_name VARCHAR(150) NOT NULL,
    template_body TEXT NOT NULL,
    segment_filter JSONB,
    status VARCHAR(50) DEFAULT 'DRAFT',
    messages_sent INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding TEXT NOT NULL  -- Vector guardado como JSON string (Compatible con cualquier PostgreSQL sin extensiones)
);

-- Indices para optimizar búsquedas conversacionales y vectoriales
CREATE INDEX IF NOT EXISTS idx_whatsapp_numbers_place_id ON whatsapp_numbers(place_id);
CREATE INDEX IF NOT EXISTS idx_conversations_place_phone ON conversations(place_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb_id ON knowledge_base_chunks(knowledge_base_id);
