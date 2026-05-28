import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaAdsController } from './meta-ads.controller';
import { MetaAdsService } from './meta-ads.service';
import { Place } from '../places/entities/place.entity';
import { PublicFeedback } from '../checkins/entities/public-feedback.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Place, PublicFeedback]),
  ],
  controllers: [MetaAdsController],
  providers: [MetaAdsService],
  exports: [MetaAdsService],
})
export class MetaAdsModule {}
