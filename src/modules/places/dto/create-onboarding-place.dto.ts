import { IsString, MinLength, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BUSINESS_TYPES } from '../business-types';

export class CreateOnboardingPlaceDto {
    @ApiProperty({ example: 'La Lucha Sanguchería' })
    @IsString()
    @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
    name: string;

    @ApiPropertyOptional({ example: 'Av. Benavides 308' })
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional({ example: 'barberia', enum: Object.keys(BUSINESS_TYPES), description: "Si se omite se asume 'restaurante'" })
    @IsOptional()
    @IsIn(Object.keys(BUSINESS_TYPES), { message: 'Tipo de negocio no válido' })
    businessType?: string;
}
