import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { AiModule } from './modules/ai/ai.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { DevicesModule } from './modules/devices/devices.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { BroadcastModule } from './modules/broadcast/broadcast.module';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';

@Module({
    imports: [
        // Configuration
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),
        ScheduleModule.forRoot(),
        BullModule.forRoot({
            connection: {
                url: process.env.REDIS_URL || 'redis://localhost:6379',
            },
        }),
        EventEmitterModule.forRoot(),

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
        AiModule,
        SubscriptionsModule,
        LoyaltyModule,
        DevicesModule,
        WhatsAppModule,
        BroadcastModule,
        AiAgentModule,
    ],
})
export class AppModule { }
