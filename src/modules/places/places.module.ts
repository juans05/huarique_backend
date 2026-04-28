import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { BusinessPlacesController } from './business-places.controller';
import { Place } from './entities/place.entity';
import { Category } from './entities/category.entity';
import { FavoritePlace } from './entities/favorite-place.entity';
import { PlaceSubmission } from './entities/place-submission.entity';
import { PlaceClaim } from './entities/place-claim.entity';
import { Tag } from './entities/tag.entity';
import { Amenity } from './entities/amenity.entity';
import { Dish } from './entities/dish.entity';
import { PlaceVideo } from './entities/place-video.entity';

import { UploadModule } from '../upload/upload.module';
import { PlaceReport } from './entities/place-report.entity';
import { GeolocationService } from './services/geolocation.service';
import { RarityCalculatorService } from './services/rarity-calculator.service';
import { GoogleMapsService } from './services/google-maps.service';
import { WeeklyReportService } from './services/weekly-report.service';
import { User } from '../users/entities/user.entity';


@Module({
    imports: [
        TypeOrmModule.forFeature([
            Place, 
            PlaceSubmission, 
            PlaceClaim, 
            PlaceReport, 
            Tag, 
            Amenity, 
            Category, 
            FavoritePlace, 
            Dish,
            PlaceVideo,
            User,
        ]),
        UploadModule,
    ],

    controllers: [PlacesController, BusinessPlacesController],
    providers: [PlacesService, GeolocationService, RarityCalculatorService, GoogleMapsService, WeeklyReportService],
    exports: [PlacesService, GeolocationService, GoogleMapsService],
})
export class PlacesModule { }
