-- "Ahora": publicaciones efimeras con ubicacion, reacciones, lista de amigos y reportes.
-- Idempotente. Requiere PostGIS (ya instalado, lo usa wuarike_db.places).

CREATE TABLE IF NOT EXISTS wuarike_db.now_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES wuarike_db.users(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('photo', 'video', 'text')),
  text VARCHAR(500),
  media_url VARCHAR,
  location GEOGRAPHY(Point, 4326) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  visibility VARCHAR(10) NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'followers', 'friends')),
  likes INT NOT NULL DEFAULT 0,
  dislikes INT NOT NULL DEFAULT 0,
  checks INT NOT NULL DEFAULT 0,
  reports INT NOT NULL DEFAULT 0,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_reason VARCHAR(20),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_now_posts_location ON wuarike_db.now_posts USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_now_posts_expires_at ON wuarike_db.now_posts (expires_at);
-- limite de publicaciones por hora
CREATE INDEX IF NOT EXISTS idx_now_posts_author_created ON wuarike_db.now_posts (author_id, created_at);

CREATE TABLE IF NOT EXISTS wuarike_db.now_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES wuarike_db.now_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES wuarike_db.users(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('like', 'dislike', 'check')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_now_reactions_post_user UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS wuarike_db.now_friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES wuarike_db.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES wuarike_db.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_now_friends_owner_friend UNIQUE (owner_id, friend_id),
  CONSTRAINT ck_now_friends_not_self CHECK (owner_id <> friend_id)
);

CREATE TABLE IF NOT EXISTS wuarike_db.now_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES wuarike_db.now_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES wuarike_db.users(id) ON DELETE CASCADE,
  reason VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_now_reports_post_user UNIQUE (post_id, user_id)
);

-- limite de reportes por dia
CREATE INDEX IF NOT EXISTS idx_now_reports_user_created ON wuarike_db.now_reports (user_id, created_at);
