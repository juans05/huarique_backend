import { IsString, IsEmail, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePlaceClaimDto {
    @ApiProperty({ example: 'Central Restaurante SAC' })
    @IsString()
    businessName: string;

    @ApiProperty({ example: 'info@centralrestaurante.com.pe' })
    @IsEmail()
    businessEmail: string;

    @ApiProperty({ example: '+51 1 2428515' })
    @IsString()
    businessPhone: string;

    @ApiPropertyOptional({ example: '+51 987654321' })
    @IsOptional()
    @IsString()
    whatsapp?: string;

    @ApiPropertyOptional({
        example: ['https://res.cloudinary.com/wuarike/catalogs/ruc.pdf'],
        description: 'URLs of supporting documents uploaded via POST /upload/document',
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    documentUrls?: string[];
}
