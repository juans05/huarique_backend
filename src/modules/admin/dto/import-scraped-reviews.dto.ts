import { IsString, IsOptional, IsArray, ArrayNotEmpty, ValidateNested, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ImportScrapedReviewDto {
    @ApiProperty({ example: 'ChIJywDjzxXIBZER5pPVfhkQfxY' })
    @IsString()
    googlePlaceId: string;

    @ApiProperty({ example: 'gordon heitshu' })
    @IsString()
    reviewer: string;

    @ApiProperty({ example: 5 })
    @IsNumber()
    rating: number;

    @ApiPropertyOptional({ example: 'en la última semana' })
    @IsOptional()
    @IsString()
    date?: string;

    @ApiPropertyOptional({ example: 'Great food, highly recommend!' })
    @IsOptional()
    @IsString()
    text?: string;

    @ApiPropertyOptional({ example: 1724000000 })
    @IsOptional()
    @IsNumber()
    time?: number;

    @ApiPropertyOptional({ example: 'https://lh3.googleusercontent.com/...' })
    @IsOptional()
    @IsString()
    authorPhotoUrl?: string;
}

export class ImportScrapedReviewsDto {
    @ApiProperty({ type: [ImportScrapedReviewDto] })
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ImportScrapedReviewDto)
    reviews: ImportScrapedReviewDto[];
}
