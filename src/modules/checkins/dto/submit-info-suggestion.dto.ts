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

    // Formato específico por campo (URL para "website", longitud para "name", etc.)
    // se valida en CheckinsService — apilar varios @ValidateIf en un mismo campo con
    // reglas distintas por condición no se comporta como cabría esperar en
    // class-validator (se confirmó en pruebas: no bloqueaba valores inválidos).
    @ApiPropertyOptional({ description: 'Requerido para todos los campos excepto menu. Para "amenities", slugs separados por coma; para "category", el slug.' })
    @ValidateIf((dto: SubmitInfoSuggestionDto) => dto.field !== 'menu')
    @IsString()
    @MaxLength(1000)
    suggestedValue?: string;
}
