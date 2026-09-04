import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { LoyaltyProgram } from './entities/loyalty-program.entity';
import { LoyaltyCard } from './entities/loyalty-card.entity';
import { LoyaltyTransaction } from './entities/loyalty-transaction.entity';
import { Reward } from './entities/reward.entity';
import { WalletCampaign } from './entities/wallet-campaign.entity';
import { LoyaltyService } from './loyalty.service';
import { WalletService } from './wallet.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyPublicController } from './loyalty-public.controller';
import { WalletCampaignProcessor } from './wallet-campaign.processor';
import { Place } from '../places/entities/place.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TeamModule } from '../team/team.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LoyaltyProgram, LoyaltyCard, LoyaltyTransaction, Reward, WalletCampaign, Place]),
    BullModule.registerQueue({ name: 'wallet-campaign' }),
    SubscriptionsModule,
    TeamModule,
    WhatsAppModule,
  ],
  controllers: [LoyaltyController, LoyaltyPublicController],
  providers: [LoyaltyService, WalletService, WalletCampaignProcessor],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
