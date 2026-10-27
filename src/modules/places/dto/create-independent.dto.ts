import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayNotEmpty,
    IsArray,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUrl,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator';

export const SERVICE_MODES = ['local', 'domicilio', 'silla'] as const;
export type ServiceMode = (typeof SERVICE_MODES)[number];

export class IndependentServiceDto {
    @ApiProperty({ example: 'Corte' })
    @IsString()
    @MinLength(2)
    @MaxLength(60)
    name: string;

    @ApiProperty({ example: 25, description: 'Soles' })
    @IsNumber()
    @Min(0)
    @Max(10000)
    price: number;

    @ApiProperty({ example: 30 })
    @IsInt()
    @Min(5)
    @Max(480)
    durationMin: number;
}

/** Registro de un barbero independiente: un local de una sola persona. */
export class CreateIndependentDto {
    @ApiProperty({ example: 'Carlos' })
    @IsString()
    @MinLength(2)
    @MaxLength(60)
    displayName: string;

    /** El formato se valida después de normalizar (minúsculas, sin @), en el servicio. */
    @ApiProperty({ example: 'carlos.fade' })
    @IsString()
    @IsNotEmpty()
    nickname: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUrl()
    photoUrl?: string;

    @ApiPropertyOptional({ example: 'San Juan de Miraflores' })
    @IsOptional()
    @IsString()
    @MaxLength(80)
    zone?: string;

    @ApiProperty({ enum: SERVICE_MODES, isArray: true })
    @IsArray()
    @ArrayNotEmpty()
    @IsIn(SERVICE_MODES, { each: true })
    serviceModes: ServiceMode[];

    @ApiProperty({ type: [IndependentServiceDto] })
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(30)
    @ValidateNested({ each: true })
    @Type(() => IndependentServiceDto)
    services: IndependentServiceDto[];
}
