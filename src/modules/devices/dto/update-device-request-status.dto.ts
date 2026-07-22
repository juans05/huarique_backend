import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DeviceRequestStatus } from '../entities/device-request.entity';

export class UpdateDeviceRequestStatusDto {
  @ApiProperty({ enum: DeviceRequestStatus, example: DeviceRequestStatus.FULFILLED })
  @IsEnum(DeviceRequestStatus)
  status: DeviceRequestStatus;
}
