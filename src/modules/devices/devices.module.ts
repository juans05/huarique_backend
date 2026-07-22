import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './entities/device.entity';
import { DeviceRequest } from './entities/device-request.entity';
import { Place } from '../places/entities/place.entity';
import { DevicesService } from './devices.service';
import {
  DevicesController,
  PublicDeviceController,
  DeviceRequestsController,
  AdminDeviceRequestsController,
} from './devices.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Device, DeviceRequest, Place])],
  controllers: [
    DevicesController,
    PublicDeviceController,
    DeviceRequestsController,
    AdminDeviceRequestsController,
  ],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
