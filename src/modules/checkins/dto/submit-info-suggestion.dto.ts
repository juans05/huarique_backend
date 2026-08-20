import { IsIn, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PlaceInfoField } from '../entities/place-info-suggestion.entity';

export class SubmitInfoSuggestionDto {
    @ApiProperty({ example: 'uuid' })
    @IsUUID()
    placeId: string;

    @ApiProperty({ enum: ['phone', 'address', 'menu'] })
    @IsIn(['phone', 'address', 'menu'])
    field: PlaceInfoField;

    @ApiPropertyOptional({ description: 'Requerido para phone/address; ignorado para menu' })
    @ValidateIf((dto: SubmitInfoSuggestionDto) => dto.field !== 'menu')
    @IsString()
    @MaxLength(300)
    suggestedValue?: string;
}
