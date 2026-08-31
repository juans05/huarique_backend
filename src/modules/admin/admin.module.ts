import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { Place } from '../places/entities/place.entity';
import { PlacePhoto } from '../places/entities/place-photo.entity';
import { PlaceSubmission } from '../places/entities/place-submission.entity';
import { PlaceClaim } from '../places/entities/place-claim.entity';
import { ComplaintBookEntry } from '../complaint-book/entities/complaint-book-entry.entity';
import { Category } from '../places/entities/category.entity';
import { Ubigeo } from '../ubigeo/entities/ubigeo.entity';
import { UsersModule } from '../users/users.module';
import { GamificationModule } from '../gamification/gamification.module';

import { Checkin } from '../checkins/entities/checkin.entity';
import { User } from '../users/entities/user.entity';
import { GoogleReview } from '../places/entities/google-review.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Place,
            PlacePhoto,
            PlaceSubmission,
            PlaceClaim,
            Category,
            Ubigeo,
            Checkin,
            User,
            GoogleReview,
            ComplaintBookEntry,
        ]),
        UsersModule,
        GamificationModule,
    ],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule { }
