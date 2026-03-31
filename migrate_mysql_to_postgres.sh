#!/bin/bash

# MySQL to PostgreSQL Migration Script for Wuarike
# This script exports data from MySQL and imports it into PostgreSQL

set -e  # Exit on error

echo "🔄 Starting MySQL to PostgreSQL Migration..."

# Configuration
MYSQL_HOST="db-mysql-ams3-88495-do-user-11532044-0.b.db.ondigitalocean.com"
MYSQL_PORT="25060"
MYSQL_USER="doadmin"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-your_mysql_password}"
MYSQL_DB="injoyplanPlace"

POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
POSTGRES_USER="wuarike_user"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-your_postgres_password}"
POSTGRES_DB="wuarike_db"

BACKUP_DIR="/tmp/wuarike_migration"

# Create backup directory
mkdir -p $BACKUP_DIR
cd $BACKUP_DIR

echo "📦 Step 1: Exporting data from MySQL..."

# Export users
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB -e "
SELECT id, email, password_hash, full_name, avatar_url, role, total_points, created_at, updated_at, last_login_at
FROM users
INTO OUTFILE '/tmp/users.csv'
FIELDS TERMINATED BY ',' ENCLOSED BY '\"' LINES TERMINATED BY '\n';"

# Export places
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB -e "
SELECT id, name, name_normalized, description, category, district, address, latitude, longitude, 
       phone, website, cover_image_url, status, is_verified, verified_at, claimed_by_user_id, 
       metadata, created_at, updated_at
FROM places
INTO OUTFILE '/tmp/places.csv'
FIELDS TERMINATED BY ',' ENCLOSED BY '\"' LINES TERMINATED BY '\n';"

# Export checkins
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB -e "
SELECT id, user_id, place_id, comment, photo_url, likes_count, created_at
FROM checkins
INTO OUTFILE '/tmp/checkins.csv'
FIELDS TERMINATED BY ',' ENCLOSED BY '\"' LINES TERMINATED BY '\n';"

# Export badges
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB -e "
SELECT id, name, description, icon_url, criteria, created_at
FROM badges
INTO OUTFILE '/tmp/badges.csv'
FIELDS TERMINATED BY ',' ENCLOSED BY '\"' LINES TERMINATED BY '\n';"

# Export user_badges
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB -e "
SELECT id, user_id, badge_id, earned_at
FROM user_badges
INTO OUTFILE '/tmp/user_badges.csv'
FIELDS TERMINATED BY ',' ENCLOSED BY '\"' LINES TERMINATED BY '\n';"

# Export user_points_log
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB -e "
SELECT id, user_id, points, reason, reference_id, created_at
FROM user_points_log
INTO OUTFILE '/tmp/user_points_log.csv'
FIELDS TERMINATED BY ',' ENCLOSED BY '\"' LINES TERMINATED BY '\n';"

# Export place_submissions
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB -e "
SELECT id, submitted_by_user_id, name, name_normalized, description, category, district, address, 
       latitude, longitude, phone, website, cover_image_url, status, reviewed_by_admin_id, 
       reviewed_at, rejection_reason, created_at
FROM place_submissions
INTO OUTFILE '/tmp/place_submissions.csv'
FIELDS TERMINATED BY ',' ENCLOSED BY '\"' LINES TERMINATED BY '\n';"

echo "✅ MySQL export completed!"

echo "📥 Step 2: Importing data into PostgreSQL..."

# Import users
PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
\COPY users(id, email, password_hash, full_name, avatar_url, role, total_points, created_at, updated_at, last_login_at) 
FROM '/tmp/users.csv' WITH CSV;
EOF

# Import places
PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
\COPY places(id, name, name_normalized, description, category, district, address, latitude, longitude, 
             phone, website, cover_image_url, status, is_verified, verified_at, claimed_by_user_id, 
             metadata, created_at, updated_at)
FROM '/tmp/places.csv' WITH CSV;
EOF

# Import checkins
PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
\COPY checkins(id, user_id, place_id, comment, photo_url, likes_count, created_at)
FROM '/tmp/checkins.csv' WITH CSV;
EOF

# Import badges
PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
\COPY badges(id, name, description, icon_url, criteria, created_at)
FROM '/tmp/badges.csv' WITH CSV;
EOF

# Import user_badges
PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
\COPY user_badges(id, user_id, badge_id, earned_at)
FROM '/tmp/user_badges.csv' WITH CSV;
EOF

# Import user_points_log
PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
\COPY user_points_log(id, user_id, points, reason, reference_id, created_at)
FROM '/tmp/user_points_log.csv' WITH CSV;
EOF

# Import place_submissions
PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
\COPY place_submissions(id, submitted_by_user_id, name, name_normalized, description, category, district, address, 
                        latitude, longitude, phone, website, cover_image_url, status, reviewed_by_admin_id, 
                        reviewed_at, rejection_reason, created_at)
FROM '/tmp/place_submissions.csv' WITH CSV;
EOF

echo "✅ PostgreSQL import completed!"

echo "🗺️ Step 3: Updating PostGIS geometry fields..."

PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
-- Update location geometry for places
UPDATE places 
SET location = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Update location geometry for place_submissions
UPDATE place_submissions 
SET location = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
EOF

echo "✅ PostGIS geometry fields updated!"

echo "🔢 Step 4: Verifying data counts..."

PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'places', COUNT(*) FROM places
UNION ALL
SELECT 'checkins', COUNT(*) FROM checkins
UNION ALL
SELECT 'badges', COUNT(*) FROM badges
UNION ALL
SELECT 'user_badges', COUNT(*) FROM user_badges
UNION ALL
SELECT 'user_points_log', COUNT(*) FROM user_points_log
UNION ALL
SELECT 'place_submissions', COUNT(*) FROM place_submissions;
EOF

echo "🧹 Step 5: Cleaning up temporary files..."
rm -f /tmp/*.csv

echo "✅ Migration completed successfully!"
echo ""
echo "📊 Next steps:"
echo "1. Update your .env file with PostgreSQL credentials"
echo "2. Test the application: npm run start:dev"
echo "3. Verify all data is accessible"
echo "4. Run: docker-compose -f docker-compose.server.yml up -d"
