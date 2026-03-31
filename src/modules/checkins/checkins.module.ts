import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckinsService } from './checkins.service';
import { CheckinsController } from './checkins.controller';
import { Checkin } from './entities/checkin.entity';
import { CheckinLike } from './entities/checkin-like.entity';
import { CheckinPhoto } from './entities/checkin-photo.entity';
import { UsersModule } from '../users/users.module';
import { PlacesModule } from '../places/places.module';
import { AntiFraudService } from './services/anti-fraud.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([Checkin, CheckinLike, CheckinPhoto]),
        UsersModule,
        PlacesModule,
    ],
    controllers: [CheckinsController],
    providers: [CheckinsService, AntiFraudService],
    exports: [CheckinsService],
})
export class CheckinsModule { }
