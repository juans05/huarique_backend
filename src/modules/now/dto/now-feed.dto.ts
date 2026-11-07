import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const FEED_SCOPES = ['following', 'nearby', 'friends'] as const;
export type NowFeedScope = (typeof FEED_SCOPES)[number];

export class NowPageDto {
    @ApiPropertyOptional({ minimum: 1, default: 1, description: '20 publicaciones por página' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(1000)
    page?: number;
}

export class NowFeedDto extends NowPageDto {
    @ApiProperty({ enum: FEED_SCOPES })
    @IsIn(FEED_SCOPES)
    scope: NowFeedScope;

    @ApiPropertyOptional({ description: 'Obligatorio con scope=nearby' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    lat?: number;

    @ApiPropertyOptional({ description: 'Obligatorio con scope=nearby' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    lng?: number;
}
