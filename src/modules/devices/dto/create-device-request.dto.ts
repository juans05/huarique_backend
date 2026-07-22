import { IsEnum, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TapType, TAP_MIN_QUANTITY } from '../entities/device-request.entity';

export class CreateDeviceRequestDto {
  @ApiProperty({ enum: TapType, example: TapType.GENERICO, description: 'Tipo de tap solicitado' })
  @IsEnum(TapType)
  tapType: TapType;

  @ApiProperty({ example: TAP_MIN_QUANTITY, description: `Cantidad de taps (mínimo ${TAP_MIN_QUANTITY})` })
  @IsInt()
  @Min(TAP_MIN_QUANTITY)
  quantity: number;
}
