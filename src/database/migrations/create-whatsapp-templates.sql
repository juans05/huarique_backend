-- Run in Railway PostgreSQL console

CREATE TYPE wuarike_db.template_status AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'FAILED');

CREATE TABLE IF NOT EXISTS wuarike_db.whatsapp_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL UNIQUE,
    category VARCHAR NOT NULL,
    language_code VARCHAR NOT NULL DEFAULT 'es',
    header_text VARCHAR,
    body TEXT NOT NULL,
    footer VARCHAR,
    buttons JSONB NOT NULL DEFAULT '[]',
    variable_samples JSONB,
    status wuarike_db.template_status NOT NULL DEFAULT 'PENDING',
    plazbot_template_id VARCHAR,
    error_message TEXT,
    plazbot_response JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
