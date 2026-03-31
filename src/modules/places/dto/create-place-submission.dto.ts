import {
    IsString,
    IsOptional,
    IsNumber,
    IsLatitude,
    IsLongitude,
    MinLength,
    IsUrl,
    IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePlaceSubmissionDto {
    @ApiProperty({ example: 'La Lucha Sanguchería' })
    @IsString()
    @MinLength(2)
    name: string;

    @ApiPropertyOptional({ example: 'Sanguchería tradicional limeña' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ example: 'uuid-de-categoria' })
    @IsUUID()
    categoryId: string;

    @ApiProperty({ example: 'Miraflores' })
    @IsString()
    district: string;

    @ApiPropertyOptional({ example: 'Av. Benavides 308' })
    @IsOptional()
    @IsString()
    address?: string;

    @ApiProperty({ example: -12.1234 })
    @IsNumber()
    @IsLatitude()
    latitude: number;

    @ApiProperty({ example: -77.0321 })
    @IsNumber()
    @IsLongitude()
    longitude: number;

    @ApiPropertyOptional({ example: '+51 1 2441234' })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiPropertyOptional({ example: 'https://example.com' })
    @IsOptional()
    @IsUrl()
    website?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUrl()
    coverImageUrl?: string;
}
