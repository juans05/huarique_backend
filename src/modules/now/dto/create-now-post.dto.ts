import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NowVisibility } from '../now-rules';
import { NowPostKind } from '../entities/now-post.entity';

// Multipart manda todo como texto: '' no puede convertirse en 0 (sería una posición falsa en 0,0).
const toNumber = ({ obj, key }: { obj: any; key: string }) =>
    obj[key] === '' || obj[key] == null ? undefined : Number(obj[key]);

export class CreateNowPostDto {
    @ApiProperty({ enum: ['photo', 'video', 'text'] })
    @IsIn(['photo', 'video', 'text'])
    kind: NowPostKind;

    @ApiPropertyOptional({ maxLength: 500 })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    text?: string;

    @ApiPropertyOptional({ enum: ['all', 'followers', 'friends'], default: 'all' })
    @IsOptional()
    @IsIn(['all', 'followers', 'friends'])
    visibility?: NowVisibility;

    @ApiProperty({ description: 'GPS del celular al publicar' })
    @Transform(toNumber)
    @IsNumber()
    latitude: number;

    @ApiProperty({ description: 'GPS del celular al publicar' })
    @Transform(toNumber)
    @IsNumber()
    longitude: number;
}
