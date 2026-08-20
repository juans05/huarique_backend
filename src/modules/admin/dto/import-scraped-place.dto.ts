import { IsString, IsOptional, IsArray, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ImportScrapedPlaceDto {
    @ApiPropertyOptional({ example: '0x9105c81797728d45:0x7bd7379c9cb86aa8' })
    @IsOptional()
    @IsString()
    mapsFeatureId?: string;

    @ApiProperty({ example: 'Panchita - Miraflores' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ example: 'Miraflores' })
    @IsOptional()
    @IsString()
    district?: string;

    @ApiPropertyOptional({ example: 'Restaurante peruano' })
    @IsOptional()
    @IsString()
    category?: string;

    @ApiPropertyOptional({ example: 'C. 2 de Mayo 298' })
    @IsOptional()
    @IsString()
    address?: string;

    // Los valores numéricos llegan como string desde el CSV del scraper
    @ApiPropertyOptional({ example: '-12.1177544' })
    @IsOptional()
    latitude?: string | number;

    @ApiPropertyOptional({ example: '-77.0312137' })
    @IsOptional()
    longitude?: string | number;

    @ApiPropertyOptional({ example: '4.6' })
    @IsOptional()
    rating?: string | number;

    @ApiPropertyOptional({ example: '3200' })
    @IsOptional()
    reviewCount?: string | number;

    @ApiPropertyOptional({ example: 'https://lh3.googleusercontent.com/...' })
    @IsOptional()
    @IsString()
    imageUrl?: string;

    @ApiPropertyOptional({ example: 'https://www.google.com/maps/place/...' })
    @IsOptional()
    @IsString()
    mapsUrl?: string;
}

export class ImportScrapedPlacesDto {
    @ApiProperty({ type: [ImportScrapedPlaceDto] })
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ImportScrapedPlaceDto)
    places: ImportScrapedPlaceDto[];
}