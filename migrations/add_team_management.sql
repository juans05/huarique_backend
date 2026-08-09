-- Migration: Team management + shared WhatsApp inbox
-- Ver docs/superpowers/specs/2026-08-09-equipos-inbox-whatsapp-design.md

BEGIN;

CREATE TABLE IF NOT EXISTS wuarike_db.place_team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES wuarike_db.users(id) ON DELETE CASCADE,
    place_id UUID NOT NULL REFERENCES wuarike_db.places(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'agente'
        CHECK (role IN ('admin', 'supervisor', 'agente')),
    invited_by_user_id UUID REFERENCES wuarike_db.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_user ON wuarike_db.place_team_members (user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_place ON wuarike_db.place_team_members (place_id);

CREATE TABLE IF NOT EXISTS wuarike_db.team_member_whatsapp_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_member_id UUID NOT NULL REFERENCES wuarike_db.place_team_members(id) ON DELETE CASCADE,
    whatsapp_number_id UUID NOT NULL REFERENCES wuarike_db.whatsapp_numbers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (team_member_id, whatsapp_number_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_access_member ON wuarike_db.team_member_whatsapp_access (team_member_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_access_number ON wuarike_db.team_member_whatsapp_access (whatsapp_number_id);

ALTER TABLE wuarike_db.conversations
    ADD COLUMN IF NOT EXISTS whatsapp_number_id UUID REFERENCES wuarike_db.whatsapp_numbers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'abierto'
        CHECK (status IN ('abierto', 'pendiente', 'cerrado')),
    ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES wuarike_db.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_active
    ON wuarike_db.conversations (place_id, whatsapp_number_id, status, assigned_to_user_id)
    WHERE status != 'cerrado';

CREATE INDEX IF NOT EXISTS idx_conversations_active_by_phone
    ON wuarike_db.conversations (place_id, customer_phone, status)
    WHERE status != 'cerrado';

-- Backfill: cada Place ya reclamado obtiene su dueño como Admin del equipo.
INSERT INTO wuarike_db.place_team_members (user_id, place_id, role)
SELECT claimed_by_user_id, id, 'admin'
FROM wuarike_db.places
WHERE claimed_by_user_id IS NOT NULL
ON CONFLICT (user_id, place_id) DO NOTHING;

COMMIT;
