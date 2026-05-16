import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceType, DeviceAction } from '../entities/device.entity';

export class CreateDeviceDto {
  @ApiProperty({
    example: 'Stand Premium Mesa 1',
    description: 'Nombre del dispositivo',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    enum: DeviceType,
    example: DeviceType.NFC,
    description: 'Tipo de dispositivo',
  })
  @IsEnum(DeviceType)
  @IsOptional()
  deviceType?: DeviceType;

  @ApiPropertyOptional({
    enum: DeviceAction,
    example: DeviceAction.REPUTATION,
    description: 'Acción al escanear',
  })
  @IsEnum(DeviceAction)
  @IsOptional()
  action?: DeviceAction;

  @ApiPropertyOptional({
    example: 'NFC-2024-001',
    description: 'Número serial del dispositivo',
  })
  @IsString()
  @IsOptional()
  serialNumber?: string;
}
