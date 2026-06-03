import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialController } from './social.controller';
import { SocialStatsController } from './social-stats.controller';
import { SocialAccount } from './entities/social-account.entity';
import { SocialComment } from './entities/social-comment.entity';
import { SocialBotRule } from './entities/social-bot-rule.entity';
import { Place } from '../places/entities/place.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([SocialAccount, SocialComment, SocialBotRule, Place]),
    ],
    controllers: [SocialController, SocialStatsController],
    exports: [],
})
export class SocialModule {}
