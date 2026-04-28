import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialController } from './social.controller';
import { SocialStatsController } from './social-stats.controller';
import { SocialAccount } from './entities/social-account.entity';
import { SocialComment } from './entities/social-comment.entity';
import { SocialBotRule } from './entities/social-bot-rule.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([SocialAccount, SocialComment, SocialBotRule]),
    ],
    controllers: [SocialController, SocialStatsController],
    exports: [],
})
export class SocialModule {}
