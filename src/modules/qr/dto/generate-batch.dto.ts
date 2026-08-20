import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QrPhysicalType } from '../entities/qr-code.entity';

export class GenerateBatchDto {
    @ApiProperty({ minimum: 1, maximum: 500, example: 100 })
    @IsInt()
    @Min(1)
    @Max(500)
    count: number;

    @ApiPropertyOptional({ enum: QrPhysicalType, default: QrPhysicalType.QR })
    @IsOptional()
    @IsIn(Object.values(QrPhysicalType))
    physicalType?: QrPhysicalType;
}
