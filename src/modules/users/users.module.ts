import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { UserFollow } from './entities/user-follow.entity';
import { CloudinaryService } from '../../common/services/cloudinary.service';

@Module({
    imports: [TypeOrmModule.forFeature([User, UserFollow])],
    controllers: [UsersController],
    providers: [UsersService, CloudinaryService],
    exports: [UsersService],
})
export class UsersModule { }
