import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushDevice } from './push-device.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';

@Module({
    imports: [TypeOrmModule.forFeature([PushDevice])],
    providers: [PushService],
    controllers: [PushController],
    exports: [PushService],
})
export class PushModule { }
