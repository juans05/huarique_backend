import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadModule } from '../upload/upload.module';
import { UserFollow } from '../users/entities/user-follow.entity';
import { Promotion } from '../places/entities/promotion.entity';
import { NowPost } from './entities/now-post.entity';
import { NowReaction } from './entities/now-reaction.entity';
import { NowFriend } from './entities/now-friend.entity';
import { NowReport } from './entities/now-report.entity';
import { NowService } from './now.service';
import { NowController } from './now.controller';

@Module({
    imports: [TypeOrmModule.forFeature([NowPost, NowReaction, NowFriend, NowReport, UserFollow, Promotion]), UploadModule],
    controllers: [NowController],
    providers: [NowService],
    exports: [NowService],
})
export class NowModule {}
