-- Create checkin_photos table. Missing since the initial commit: the
-- CheckinPhoto TypeORM entity and its leftJoinAndSelect in
-- CheckinsService.getFeed() reference this table, but it was never migrated
-- into production, so GET /checkins/feed 500s unconditionally (and creating
-- a check-in with photos fails too).
CREATE TABLE IF NOT EXISTS wuarike_db.checkin_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id UUID NOT NULL REFERENCES wuarike_db.checkins(id) ON DELETE CASCADE,
  url VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checkin_photos_checkin_id ON wuarike_db.checkin_photos(checkin_id);
