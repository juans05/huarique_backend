import { IsOptional, IsEnum, IsUUID, IsInt, Min, Max, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { CreateDeviceDto } from './create-device.dto';
import { DeviceStatus } from '../entities/device.entity';

export class UpdateDeviceDto extends PartialType(CreateDeviceDto) {
  @ApiPropertyOptional({
    enum: DeviceStatus,
    example: DeviceStatus.ACTIVE,
    description: 'Estado del dispositivo',
  })
  @IsEnum(DeviceStatus)
  @IsOptional()
  status?: DeviceStatus;

  @ApiPropertyOptional({ description: 'Miembro del equipo que usa el dispositivo (null para quitarlo)', nullable: true })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  teamMemberId?: string | null;

  @ApiPropertyOptional({ description: 'Meta semanal de opiniones (1–500, null para quitarla)', nullable: true })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(1)
  @Max(500)
  weeklyGoal?: number | null;
}
