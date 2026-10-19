import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryContactDto extends PaginationDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ enum: ['whatsapp', 'feedback', 'import', 'order', 'loyalty'] })
    @IsOptional()
    @IsEnum(['whatsapp', 'feedback', 'import', 'order', 'loyalty'] as any)
    source?: 'whatsapp' | 'feedback' | 'import' | 'order' | 'loyalty';

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    tag?: string;

    // Obligatorio: el controller responde 400 en español si falta.
    @ApiProperty()
    @IsOptional()
    @IsString()
    placeId: string;
}
