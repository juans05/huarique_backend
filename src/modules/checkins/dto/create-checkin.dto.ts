import { IsString, IsOptional, MaxLength, IsUrl, IsUUID } from 'class-validator';
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
}
