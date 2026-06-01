import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { CreditBalance } from './entities/credit-balance.entity';
import { CreditTransaction } from './entities/credit-transaction.entity';
import { Place } from '../places/entities/place.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([CreditBalance, CreditTransaction, Place]),
    ],
    controllers: [CreditsController],
    providers: [CreditsService],
    exports: [CreditsService, TypeOrmModule],
})
export class CreditsModule {}
