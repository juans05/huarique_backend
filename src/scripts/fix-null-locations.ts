
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import 'reflect-metadata';

// Core
import { User } from '../modules/users/entities/user.entity';
import { UserFollow } from '../modules/users/entities/user-follow.entity';

// Places
import { Place } from '../modules/places/entities/place.entity';
import { PlaceSubmission } from '../modules/places/entities/place-submission.entity';
import { PlaceClaim } from '../modules/places/entities/place-claim.entity';
import { PlaceReport } from '../modules/places/entities/place-report.entity';
import { Tag } from '../modules/places/entities/tag.entity';
import { Amenity } from '../modules/places/entities/amenity.entity';
import { Category } from '../modules/places/entities/category.entity';
import { Dish } from '../modules/places/entities/dish.entity';
import { PlaceVideo } from '../modules/places/entities/place-video.entity';

// Checkins
import { Checkin } from '../modules/checkins/entities/checkin.entity';
import { CheckinLike } from '../modules/checkins/entities/checkin-like.entity';
import { CheckinPhoto } from '../modules/checkins/entities/checkin-photo.entity';

// Gamification
import { Badge } from '../modules/gamification/entities/badge.entity';
import { Mission } from '../modules/gamification/entities/mission.entity';
import { UserBadge } from '../modules/gamification/entities/user-badge.entity';
import { UserMission } from '../modules/gamification/entities/user-mission.entity';
import { UserPointsLog } from '../modules/gamification/entities/user-points-log.entity';
import { UserStreak } from '../modules/gamification/entities/user-streak.entity';

// Auth
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';

// Ubigeo
import { Ubigeo } from '../modules/ubigeo/entities/ubigeo.entity';

config();

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'doadmin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'wuarike_db',
    schema: process.env.DB_SCHEMA || 'wuarike_db',
    entities: [
        User,
        UserFollow,
        Place,
        PlaceSubmission,
        PlaceClaim,
        PlaceReport,
        Tag,
        Amenity,
        Checkin,
        CheckinLike,
        CheckinPhoto,
        Badge,
        Mission,
        UserBadge,
        UserMission,
        UserPointsLog,
        UserStreak,
        RefreshToken,
        Ubigeo,
        Category,
        Dish,
        PlaceVideo
    ],
    ssl: false,
    synchronize: false,
});

const fixNullLocations = async () => {
    try {
        await AppDataSource.initialize();
        console.log('📦 Connected to PostgreSQL...');

        const placeRepo = AppDataSource.getRepository(Place);

        // Find places with NULL location but existing lat/long
        const placesToFix = await placeRepo.createQueryBuilder('place')
            .where('place.location IS NULL')
            .andWhere('place.latitude IS NOT NULL')
            .andWhere('place.longitude IS NOT NULL')
            .getMany();

        console.log(`🔍 Found ${placesToFix.length} places with NULL location.`);

        for (const place of placesToFix) {
            console.log(`🛠️ Fixing location for: ${place.name} (${place.id})`);
            
            // PostGIS GeoJSON format
            place.location = {
                type: 'Point',
                coordinates: [Number(place.longitude), Number(place.latitude)],
            };

            await placeRepo.save(place);
        }

        console.log('✅ All NULL locations have been fixed.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to fix locations:', error);
        process.exit(1);
    }
};

fixNullLocations();
