import { IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOnboardingPlaceDto {
    @ApiProperty({ example: 'La Lucha Sanguchería' })
    @IsString()
    @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
    name: string;

    @ApiPropertyOptional({ example: 'Av. Benavides 308' })
    @IsOptional()
    @IsString()
    address?: string;
}
