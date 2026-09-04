import { IsString, IsOptional, MaxLength, IsUrl, IsUUID, IsLatitude, IsLongitude, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCheckinDto {
    @ApiProperty({ example: 'uuid' })
    @IsUUID()
    placeId: string;

    @ApiPropertyOptional({ example: '¡Increíble ceviche! 🐟', maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    comment?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUrl()
    photoUrl?: string;

    @ApiPropertyOptional({ type: [String], description: 'URLs of additional photos' })
    @IsOptional()
    @IsString({ each: true })
    photos?: string[];

    @ApiPropertyOptional({ minimum: 1, maximum: 5 })
    @IsOptional()
    rating?: number;

    @ApiPropertyOptional({ description: 'Ubicación GPS del dispositivo al hacer check-in, para detectar viajes imposibles entre locales.' })
    @IsOptional()
    @IsLatitude()
    latitude?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsLongitude()
    longitude?: number;

    @ApiPropertyOptional({ example: 'Lomo saltado', maxLength: 100, description: '¿Qué pediste?' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    dishName?: string;

    @ApiPropertyOptional({ example: 28, description: 'Precio aproximado del plato' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    dishPrice?: number;
}
