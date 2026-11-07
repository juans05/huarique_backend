import { Type } from 'class-transformer';
import { IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Caja del mapa visible. El rango y el orden de las esquinas los valida NowService. */
export class NowAreaDto {
    @ApiProperty() @Type(() => Number) @IsNumber() minLat: number;
    @ApiProperty() @Type(() => Number) @IsNumber() minLng: number;
    @ApiProperty() @Type(() => Number) @IsNumber() maxLat: number;
    @ApiProperty() @Type(() => Number) @IsNumber() maxLng: number;
}
