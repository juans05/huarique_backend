import { createConnection, Connection } from 'typeorm';

// MySQL Configuration
const mysqlConfig = {
    type: 'mysql' as const,
    host: 'db-mysql-ams3-88495-do-user-11532044-0.b.db.ondigitalocean.com',
    port: 25060,
    username: 'doadmin',
    password: process.env.MYSQL_PASSWORD,
    database: 'injoyplanPlace',
    ssl: {
        rejectUnauthorized: false,
    },
};

// PostgreSQL Configuration (Via SSH Tunnel)
const postgresConfig = {
    type: 'postgres' as const,
    host: 'localhost',
    port: 5433, // Tunnel port
    username: 'doadmin',
    password: process.env.DB_PASSWORD,
    database: 'wuarike_db',
    schema: 'wuarike_db', // Target Schema
    ssl: false,
};

async function migrateData() {
    let mysqlConn: Connection | null = null;
    let postgresConn: Connection | null = null;

    try {
        console.log('🔄 Starting MySQL to PostgreSQL Migration...\n');

        // Connect to MySQL
        console.log('📡 Connecting to MySQL...');
        mysqlConn = await createConnection({
            ...mysqlConfig,
            name: 'mysql',
        });
        console.log('✅ MySQL connected!\n');

        // Connect to PostgreSQL
        console.log('📡 Connecting to PostgreSQL...');
        postgresConn = await createConnection({
            ...postgresConfig,
            name: 'postgres',
        });
        console.log('✅ PostgreSQL connected!\n');

        // Enable PostGIS
        console.log('🗺️ Enabling PostGIS extension...');
        await postgresConn.query('CREATE EXTENSION IF NOT EXISTS postgis;');
        console.log('✅ PostGIS enabled!\n');

        // Migrate Users
        console.log('👥 Migrating users...');
        const users = await mysqlConn.query('SELECT * FROM users');
        if (users.length > 0) {
            for (const user of users) {
                await postgresConn.query(
                    `INSERT INTO users (id, email, password_hash, full_name, avatar_url, role, total_points, current_level, created_at, updated_at, last_login_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                     ON CONFLICT (id) DO NOTHING`,
                    [
                        user.id,
                        user.email,
                        user.password_hash,
                        user.full_name,
                        user.avatar_url,
                        user.role,
                        user.total_points,
                        1, // current_level default
                        user.created_at,
                        user.updated_at,
                        user.last_login_at,
                    ]
                );
            }
            console.log(`✅ Migrated ${users.length} users\n`);
        }

        // Migrate Places
        console.log('📍 Migrating places...');
        const places = await mysqlConn.query('SELECT * FROM places');
        if (places.length > 0) {
            for (const place of places) {
                // Insert place
                await postgresConn.query(
                    `INSERT INTO places (id, name, name_normalized, description, category, district, address, 
                                        latitude, longitude, phone, website, cover_image_url, status, 
                                        is_verified, verified_at, claimed_by_user_id, rarity, rarity_score,
                                        metadata, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                     ON CONFLICT (id) DO NOTHING`,
                    [
                        place.id,
                        place.name,
                        place.name_normalized,
                        place.description,
                        place.category,
                        place.district,
                        place.address,
                        place.latitude,
                        place.longitude,
                        place.phone,
                        place.website,
                        place.cover_image_url,
                        place.status,
                        place.is_verified,
                        place.verified_at,
                        place.claimed_by_user_id,
                        'COMÚN', // default rarity
                        0, // default rarity_score
                        place.metadata,
                        place.created_at,
                        place.updated_at,
                    ]
                );

                // Update PostGIS location field
                if (place.latitude && place.longitude) {
                    await postgresConn.query(
                        `UPDATE places 
                         SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
                         WHERE id = $3`,
                        [place.longitude, place.latitude, place.id]
                    );
                }
            }
            console.log(`✅ Migrated ${places.length} places\n`);
        }

        // Migrate Checkins
        console.log('✅ Migrating checkins...');
        const checkins = await mysqlConn.query('SELECT * FROM checkins');
        if (checkins.length > 0) {
            for (const checkin of checkins) {
                await postgresConn.query(
                    `INSERT INTO checkins (id, user_id, place_id, comment, photo_url, likes_count, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (id) DO NOTHING`,
                    [
                        checkin.id,
                        checkin.user_id,
                        checkin.place_id,
                        checkin.comment,
                        checkin.photo_url,
                        checkin.likes_count,
                        checkin.created_at,
                    ]
                );
            }
            console.log(`✅ Migrated ${checkins.length} checkins\n`);
        }

        // Migrate Badges
        console.log('🏅 Migrating badges...');
        const badges = await mysqlConn.query('SELECT * FROM badges');
        if (badges.length > 0) {
            for (const badge of badges) {
                await postgresConn.query(
                    `INSERT INTO badges (id, name, description, icon_url, criteria, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (id) DO NOTHING`,
                    [
                        badge.id,
                        badge.name,
                        badge.description,
                        badge.icon_url,
                        badge.criteria,
                        badge.created_at,
                    ]
                );
            }
            console.log(`✅ Migrated ${badges.length} badges\n`);
        }

        // Migrate User Badges
        console.log('🎖️ Migrating user badges...');
        const userBadges = await mysqlConn.query('SELECT * FROM user_badges');
        if (userBadges.length > 0) {
            for (const userBadge of userBadges) {
                await postgresConn.query(
                    `INSERT INTO user_badges (id, user_id, badge_id, earned_at)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (id) DO NOTHING`,
                    [
                        userBadge.id,
                        userBadge.user_id,
                        userBadge.badge_id,
                        userBadge.earned_at,
                    ]
                );
            }
            console.log(`✅ Migrated ${userBadges.length} user badges\n`);
        }

        // Migrate User Points Log
        console.log('📊 Migrating user points log...');
        const pointsLog = await mysqlConn.query('SELECT * FROM user_points_log');
        if (pointsLog.length > 0) {
            for (const log of pointsLog) {
                await postgresConn.query(
                    `INSERT INTO user_points_log (id, user_id, points, reason, reference_id, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (id) DO NOTHING`,
                    [
                        log.id,
                        log.user_id,
                        log.points,
                        log.reason,
                        log.reference_id,
                        log.created_at,
                    ]
                );
            }
            console.log(`✅ Migrated ${pointsLog.length} points log entries\n`);
        }

        // Migrate Place Submissions
        console.log('📝 Migrating place submissions...');
        const submissions = await mysqlConn.query('SELECT * FROM place_submissions');
        if (submissions.length > 0) {
            for (const submission of submissions) {
                await postgresConn.query(
                    `INSERT INTO place_submissions (id, submitted_by_user_id, name, name_normalized, description, 
                                                    category, district, address, latitude, longitude, phone, website, 
                                                    cover_image_url, status, reviewed_by_admin_id, reviewed_at, 
                                                    rejection_reason, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                     ON CONFLICT (id) DO NOTHING`,
                    [
                        submission.id,
                        submission.submitted_by_user_id,
                        submission.name,
                        submission.name_normalized,
                        submission.description,
                        submission.category,
                        submission.district,
                        submission.address,
                        submission.latitude,
                        submission.longitude,
                        submission.phone,
                        submission.website,
                        submission.cover_image_url,
                        submission.status,
                        submission.reviewed_by_admin_id,
                        submission.reviewed_at,
                        submission.rejection_reason,
                        submission.created_at,
                    ]
                );
            }
            console.log(`✅ Migrated ${submissions.length} place submissions\n`);
        }

        // Verify counts
        console.log('🔢 Verifying data counts...');
        const counts = await postgresConn.query(`
            SELECT 'users' as table_name, COUNT(*) as count FROM users
            UNION ALL SELECT 'places', COUNT(*) FROM places
            UNION ALL SELECT 'checkins', COUNT(*) FROM checkins
            UNION ALL SELECT 'badges', COUNT(*) FROM badges
            UNION ALL SELECT 'user_badges', COUNT(*) FROM user_badges
            UNION ALL SELECT 'user_points_log', COUNT(*) FROM user_points_log
            UNION ALL SELECT 'place_submissions', COUNT(*) FROM place_submissions
        `);
        console.table(counts);

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📊 Next steps:');
        console.log('1. Update your .env file with PostgreSQL credentials');
        console.log('2. Test the application: npm run start:dev');
        console.log('3. Deploy: docker-compose -f docker-compose.server.yml up -d');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        // Close connections
        if (mysqlConn) {
            await mysqlConn.close();
            console.log('\n🔌 MySQL connection closed');
        }
        if (postgresConn) {
            await postgresConn.close();
            console.log('🔌 PostgreSQL connection closed');
        }
    }
}

// Run migration
migrateData()
    .then(() => {
        console.log('\n🎉 All done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });
