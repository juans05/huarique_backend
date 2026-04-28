import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PlacesModule } from './modules/places/places.module';
import { CheckinsModule } from './modules/checkins/checkins.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { MissionsModule } from './modules/missions/missions.module';
import { AdminModule } from './modules/admin/admin.module';
import { UploadModule } from './modules/upload/upload.module';
import { UbigeoModule } from './modules/ubigeo/ubigeo.module';
import { SocialModule } from './modules/social/social.module';
import { CommonModule } from './common/common.module';

@Module({
    imports: [
        // Configuration
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),
        ScheduleModule.forRoot(),

        // Database
        TypeOrmModule.forRootAsync({
            useClass: DatabaseConfig,
        }),

        // Rate limiting
        ThrottlerModule.forRoot([
            {
                ttl: parseInt(process.env.THROTTLE_TTL || '60') * 1000,
                limit: parseInt(process.env.THROTTLE_LIMIT || '100'),
            },
        ]),

        // Global services
        CommonModule,

        // Feature modules
        AuthModule,
        UsersModule,
        PlacesModule,
        CheckinsModule,
        GamificationModule,
        MissionsModule,
        AdminModule,
        UploadModule,
        UbigeoModule,
        SocialModule,
    ],
})
export class AppModule { }
