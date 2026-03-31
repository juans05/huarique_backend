import { IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
    @ApiPropertyOptional({ description: 'Nombre completo del usuario' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    fullName?: string;

    @ApiPropertyOptional({ description: 'Biografía o descripción del usuario' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    bio?: string;

    @ApiPropertyOptional({ description: 'URL de la foto de perfil' })
    @IsOptional()
    @IsString()
    avatarUrl?: string;

    @ApiPropertyOptional({ description: 'Pronombres del usuario', example: 'Él/He' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    pronouns?: string;

    @ApiPropertyOptional({ description: 'Género del usuario', example: 'Masculino' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    gender?: string;

    @ApiPropertyOptional({ description: 'Fecha de nacimiento (ISO 8601)', example: '1990-05-15' })
    @IsOptional()
    @IsDateString()
    birthDate?: string;
}
