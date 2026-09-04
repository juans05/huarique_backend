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

    // Obligatorias: sin esto no hay forma de verificar que el check-in es real
    // (proximidad al local) ni de detectar viajes imposibles entre check-ins —
    // dejarlas opcionales significaba que bastaba con no mandarlas para saltarse
    // ambos chequeos.
    @ApiProperty({ description: 'Ubicación GPS del dispositivo al hacer check-in — obligatoria, se valida contra la ubicación del local.' })
    @IsLatitude()
    latitude: number;

    @ApiProperty()
    @IsLongitude()
    longitude: number;

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
