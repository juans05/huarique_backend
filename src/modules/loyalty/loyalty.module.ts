import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoyaltyProgram } from './entities/loyalty-program.entity';
import { LoyaltyCard } from './entities/loyalty-card.entity';
import { LoyaltyTransaction } from './entities/loyalty-transaction.entity';
import { Reward } from './entities/reward.entity';
import { LoyaltyService } from './loyalty.service';
import { WalletService } from './wallet.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyPublicController } from './loyalty-public.controller';
import { Place } from '../places/entities/place.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [TypeOrmModule.forFeature([LoyaltyProgram, LoyaltyCard, LoyaltyTransaction, Reward, Place]), SubscriptionsModule],
  controllers: [LoyaltyController, LoyaltyPublicController],
  providers: [LoyaltyService, WalletService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
