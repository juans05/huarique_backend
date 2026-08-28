import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePlatformSettingsDto {
    @ApiPropertyOptional({ example: 'consulta@wuarikes.com' })
    @IsOptional()
    @IsString()
    contactEmail?: string;

    @ApiPropertyOptional({ example: '+51 902 191 948' })
    @IsOptional()
    @IsString()
    contactPhone?: string;

    @ApiPropertyOptional({ example: 'Lima, Perú' })
    @IsOptional()
    @IsString()
    contactAddress?: string;

    @ApiPropertyOptional({ example: 'https://instagram.com/warique_app' })
    @IsOptional()
    @IsString()
    socialInstagram?: string;

    @ApiPropertyOptional({ example: 'https://facebook.com/warique' })
    @IsOptional()
    @IsString()
    socialFacebook?: string;

    @ApiPropertyOptional({ example: 'https://tiktok.com/@warique' })
    @IsOptional()
    @IsString()
    socialTiktok?: string;

    @ApiPropertyOptional({ example: 'https://x.com/warique' })
    @IsOptional()
    @IsString()
    socialX?: string;
}
