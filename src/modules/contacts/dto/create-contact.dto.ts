import { IsOptional, IsString, IsEnum, IsBoolean, IsArray, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContactDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    email?: string;

    @ApiPropertyOptional({ description: 'DNI del cliente (opcional)' })
    @IsOptional()
    @IsString()
    dni?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsObject()
    customFields?: any;

    @ApiPropertyOptional({ enum: ['import'] })
    @IsOptional()
    @IsEnum(['import' as any])
    source?: 'import';

    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    marketingConsent?: boolean;
}
