ALTER TABLE wuarike_db.place_info_suggestions
    DROP CONSTRAINT IF EXISTS place_info_suggestions_field_check;

ALTER TABLE wuarike_db.place_info_suggestions
    ADD CONSTRAINT place_info_suggestions_field_check
    CHECK (field IN ('phone', 'address', 'menu', 'hours', 'name', 'website', 'category', 'amenities'));
