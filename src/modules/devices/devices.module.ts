import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './entities/device.entity';
import { Place } from '../places/entities/place.entity';
import { DevicesService } from './devices.service';
import { DevicesController, PublicDeviceController } from './devices.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Device, Place])],
  controllers: [DevicesController, PublicDeviceController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
