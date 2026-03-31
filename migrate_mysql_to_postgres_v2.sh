#!/bin/bash

# MySQL to PostgreSQL Migration Script for Wuarike (Alternative Method)
# Uses mysqldump instead of INTO OUTFILE (works with managed databases)

set -e  # Exit on error

echo "🔄 Starting MySQL to PostgreSQL Migration (Alternative Method)..."

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

echo "📦 Step 1: Creating full MySQL dump..."

# Full database dump
mysqldump -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD \
  --single-transaction \
  --skip-triggers \
  --no-create-db \
  --compatible=postgresql \
  --default-character-set=utf8 \
  $MYSQL_DB > mysql_dump.sql

echo "✅ MySQL dump completed!"

echo "🔧 Step 2: Converting MySQL dump to PostgreSQL format..."

# Replace MySQL-specific syntax with PostgreSQL
sed -i 's/ENGINE=InnoDB//g' mysql_dump.sql
sed -i 's/AUTO_INCREMENT=[0-9]*//g' mysql_dump.sql
sed -i "s/\`//g" mysql_dump.sql
sed -i 's/TYPE=MyISAM//g' mysql_dump.sql
sed -i 's/UNSIGNED//g' mysql_dump.sql

# Convert datetime to timestamp
sed -i 's/datetime/timestamp/g' mysql_dump.sql

echo "✅ Conversion completed!"

echo "📥 Step 3: Creating PostgreSQL tables..."

# First, let's create the schema using TypeORM synchronize
# This is safer than trying to convert CREATE TABLE statements

PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Tables will be created by TypeORM synchronize
-- Just ensure the database is clean
EOF

echo "✅ PostgreSQL ready!"

echo "📊 Step 4: Exporting data to CSV format..."

# Export each table to CSV
mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB \
  --batch --skip-column-names \
  -e "SELECT * FROM users" | sed 's/\t/,/g' > users.csv

mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB \
  --batch --skip-column-names \
  -e "SELECT * FROM places" | sed 's/\t/,/g' > places.csv

mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB \
  --batch --skip-column-names \
  -e "SELECT * FROM checkins" | sed 's/\t/,/g' > checkins.csv

mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB \
  --batch --skip-column-names \
  -e "SELECT * FROM badges" | sed 's/\t/,/g' > badges.csv

mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB \
  --batch --skip-column-names \
  -e "SELECT * FROM user_badges" | sed 's/\t/,/g' > user_badges.csv

mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB \
  --batch --skip-column-names \
  -e "SELECT * FROM user_points_log" | sed 's/\t/,/g' > user_points_log.csv

mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DB \
  --batch --skip-column-names \
  -e "SELECT * FROM place_submissions" | sed 's/\t/,/g' > place_submissions.csv

echo "✅ CSV export completed!"

echo "📥 Step 5: Importing data into PostgreSQL..."

# Note: Make sure tables exist first (run your NestJS app with synchronize: true once)

# Import users
if [ -s users.csv ]; then
  PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c \
    "\COPY users FROM '$BACKUP_DIR/users.csv' WITH (FORMAT csv, DELIMITER ',', NULL 'NULL');"
fi

# Import places
if [ -s places.csv ]; then
  PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c \
    "\COPY places FROM '$BACKUP_DIR/places.csv' WITH (FORMAT csv, DELIMITER ',', NULL 'NULL');"
fi

# Import checkins
if [ -s checkins.csv ]; then
  PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c \
    "\COPY checkins FROM '$BACKUP_DIR/checkins.csv' WITH (FORMAT csv, DELIMITER ',', NULL 'NULL');"
fi

# Import badges
if [ -s badges.csv ]; then
  PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c \
    "\COPY badges FROM '$BACKUP_DIR/badges.csv' WITH (FORMAT csv, DELIMITER ',', NULL 'NULL');"
fi

# Import user_badges
if [ -s user_badges.csv ]; then
  PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c \
    "\COPY user_badges FROM '$BACKUP_DIR/user_badges.csv' WITH (FORMAT csv, DELIMITER ',', NULL 'NULL');"
fi

# Import user_points_log
if [ -s user_points_log.csv ]; then
  PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c \
    "\COPY user_points_log FROM '$BACKUP_DIR/user_points_log.csv' WITH (FORMAT csv, DELIMITER ',', NULL 'NULL');"
fi

# Import place_submissions
if [ -s place_submissions.csv ]; then
  PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c \
    "\COPY place_submissions FROM '$BACKUP_DIR/place_submissions.csv' WITH (FORMAT csv, DELIMITER ',', NULL 'NULL');"
fi

echo "✅ PostgreSQL import completed!"

echo "🗺️ Step 6: Updating PostGIS geometry fields..."

PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
-- Update location geometry for places
UPDATE places 
SET location = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND location IS NULL;

-- Update location geometry for place_submissions (if exists)
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'place_submissions' AND column_name = 'location') THEN
    UPDATE place_submissions 
    SET location = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)::geography
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND location IS NULL;
  END IF;
END \$\$;
EOF

echo "✅ PostGIS geometry fields updated!"

echo "🔢 Step 7: Verifying data counts..."

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

echo "🧹 Step 8: Cleaning up temporary files..."
rm -f $BACKUP_DIR/*.csv
rm -f $BACKUP_DIR/mysql_dump.sql

echo "✅ Migration completed successfully!"
echo ""
echo "📊 Next steps:"
echo "1. Verify data in PostgreSQL"
echo "2. Update your .env file with PostgreSQL credentials"
echo "3. Test the application: npm run start:dev"
echo "4. Deploy: docker-compose -f docker-compose.server.yml up -d"
