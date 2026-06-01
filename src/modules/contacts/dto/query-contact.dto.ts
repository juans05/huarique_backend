import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryContactDto extends PaginationDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ enum: ['whatsapp', 'feedback', 'import'] })
    @IsOptional()
    @IsEnum(['whatsapp' as any, 'feedback' as any, 'import' as any])
    source?: 'whatsapp' | 'feedback' | 'import';

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    tag?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    placeId: string;
}
