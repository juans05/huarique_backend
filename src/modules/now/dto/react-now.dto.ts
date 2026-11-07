import { IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NowReactionType } from '../entities/now-reaction.entity';

export class ReactNowDto {
    @ApiProperty({ enum: ['like', 'dislike', 'check'] })
    @IsIn(['like', 'dislike', 'check'])
    type: NowReactionType;

    @ApiPropertyOptional({ description: 'GPS del celular. Obligatorio para ✅ (a menos de 300 m)' })
    @IsOptional()
    @IsNumber()
    latitude?: number;

    @ApiPropertyOptional({ description: 'GPS del celular. Obligatorio para ✅ (a menos de 300 m)' })
    @IsOptional()
    @IsNumber()
    longitude?: number;
}

export class ReportNowDto {
    @ApiProperty({ maxLength: 200 })
    @IsString()
    @MaxLength(200)
    reason: string;
}
