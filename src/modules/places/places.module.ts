import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { Place } from './entities/place.entity';
import { Category } from './entities/category.entity';
import { FavoritePlace } from './entities/favorite-place.entity';
import { PlaceSubmission } from './entities/place-submission.entity';
import { PlaceClaim } from './entities/place-claim.entity';
import { PlaceReport } from './entities/place-report.entity';
import { GeolocationService } from './services/geolocation.service';
import { RarityCalculatorService } from './services/rarity-calculator.service';

import { Tag } from './entities/tag.entity';
import { Amenity } from './entities/amenity.entity';
import { Dish } from './entities/dish.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Place, PlaceSubmission, PlaceClaim, PlaceReport, Tag, Amenity, Category, FavoritePlace, Dish])],
    controllers: [PlacesController],
    providers: [PlacesService, GeolocationService, RarityCalculatorService],
    exports: [PlacesService, GeolocationService],
})
export class PlacesModule { }
