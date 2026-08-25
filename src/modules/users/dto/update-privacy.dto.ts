import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePrivacyDto {
    @ApiPropertyOptional({ description: 'Si el perfil es visible para otros usuarios' })
    @IsOptional()
    @IsBoolean()
    isProfilePublic?: boolean;

    @ApiPropertyOptional({ description: 'Si la lista de favoritos es visible para otros usuarios' })
    @IsOptional()
    @IsBoolean()
    areFavoritesPublic?: boolean;

    @ApiPropertyOptional({ description: 'Si los negocios pueden enviarte mensajes directos' })
    @IsOptional()
    @IsBoolean()
    allowBusinessMessages?: boolean;

    @ApiPropertyOptional({ description: 'Si apareces en la búsqueda de amigos por nombre/correo' })
    @IsOptional()
    @IsBoolean()
    isDiscoverable?: boolean;
}
