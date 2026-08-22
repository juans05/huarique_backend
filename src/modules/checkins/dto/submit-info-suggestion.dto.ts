import { IsIn, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PlaceInfoField } from '../entities/place-info-suggestion.entity';

export class SubmitInfoSuggestionDto {
    @ApiProperty({ example: 'uuid' })
    @IsUUID()
    placeId: string;

    @ApiProperty({ enum: ['phone', 'address', 'menu', 'hours', 'name', 'website', 'category', 'amenities'] })
    @IsIn(['phone', 'address', 'menu', 'hours', 'name', 'website', 'category', 'amenities'])
    field: PlaceInfoField;

    @ApiPropertyOptional({ description: 'Requerido para todos los campos excepto menu. Para "amenities", slugs separados por coma; para "category", el slug.' })
    @ValidateIf((dto: SubmitInfoSuggestionDto) => dto.field !== 'menu')
    @IsString()
    @MaxLength(1000)
    suggestedValue?: string;
}
