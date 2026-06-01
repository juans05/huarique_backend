import { IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryAuditLogDto extends PaginationDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    placeId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    action?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    entityType?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    from?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    to?: string;
}
